// ============================================================
// Audio streaming server: mixes the game's music SERVER-SIDE and
// streams one continuous MP3 to the game, so the browser never
// downloads the multi-hundred-MB track files.
//
// Per session (one per game start):
//   - random track from server/music/*.mp3 at a random position
//   - sources are decoded to raw PCM by ffmpeg, gain-stamped (fade
//     in/out) and summed in JS, re-encoded to192k MP3 once
//   - /music/crossfade starts the other track with a fade-in while
//     every current source fades out (the wave-start mix-over)
//
// Run: npm run music     (dev.mjs spawns it alongside server+vite)
// ============================================================
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer, type ServerResponse } from 'node:http';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = join(__dirname, 'music');
const PORT = Number(process.env.MUSIC_PORT ?? 4001);

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const FRAME_BYTES = CHANNELS * 2; // s16le
const TICK_MS = 50;
const BYTES_PER_TICK = Math.floor((SAMPLE_RATE * FRAME_BYTES * TICK_MS) / 1000);
const FADE_S = 1.5;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

interface Source {
  child: ChildProcess;
  pending: Buffer[];
  gain: number;
  targetGain: number;
  dying: boolean;
}

class MusicSession {
  readonly id: string;
  private sources: Source[] = [];
  private encoder: ChildProcess | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private out: ServerResponse | null = null;
  private currentFile: string | null = null;
  private durations = new Map<string, number>();
  private encoderRetries = 0;
  private lastCrossfadeAt = 0;
  private closed = false;
  ticks = 0;
  encoderAlive = false;

  constructor(id: string) {
    this.id = id;
    this.startEncoder();
    this.startRandomTrack();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  isClosed(): boolean {
    return this.closed;
  }

  private pickTrack(except?: string | null): string | null {
    let files: string[] = [];
    try {
      files = readdirSync(MUSIC_DIR).filter((f) => f.toLowerCase().endsWith('.mp3'));
    } catch {
      return null;
    }
    if (files.length === 0) return null;
    const others = files.filter((f) => f !== except);
    const pool = others.length > 0 ? others : files;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private durationOf(file: string): number {
    const cached = this.durations.get(file);
    if (cached !== undefined) return cached;
    let dur = 0;
    try {
      const out = execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(MUSIC_DIR, file)],
        { encoding: 'utf8' },
      );
      const n = parseFloat(out);
      if (Number.isFinite(n)) dur = n;
    } catch {
      dur = 0;
    }
    this.durations.set(file, dur);
    return dur;
  }

  /** Decode a track to raw PCM, starting at a random position. */
  private startSource(file: string): void {
    const path = join(MUSIC_DIR, file);
    if (!existsSync(path)) return;
    const dur = this.durationOf(file);
    const pos = dur > 30 ? Math.random() * (dur - 30) : 0;
    const child = spawn(
      'ffmpeg',
      [
        '-v', 'error',
        // Native pacing: without it ffmpeg races through the whole file
        // in seconds (our reader drops instead of blocking), the source
        // hits EOF, and the exit handler stacks a fresh track every few
        // seconds — the endless "mixing back and forth".
        '-re',
        '-ss', String(pos),
        '-i', path,
        '-vn',
        '-f', 's16le',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const src: Source = { child, pending: [], gain: 0, targetGain: 1, dying: false };
    const cap = SAMPLE_RATE * FRAME_BYTES * 2; // never buffer more than2s
    child.stdout!.on('data', (chunk: Buffer) => {
      let len = 0;
      for (const b of src.pending) len += b.length;
      if (len < cap) src.pending.push(chunk);
      else chunk.length; // over cap: drop
    });
    (child.stderr as NodeJS.ReadableStream | null)?.on('data', (d: Buffer) =>
      console.error('[source]', d.toString().trim()),
    );
    child.on('exit', (code) => {
      // Track ran out: hand over to a fresh random pick (like before)
      if (!src.dying && !this.closed) {
        console.error('[source] exited with code', code);
        this.startRandomTrack();
      }
    });
    this.sources.push(src);
    this.currentFile = file;
  }

  private startRandomTrack(): void {
    if (this.closed) return;
    const file = this.pickTrack();
    if (file) this.startSource(file);
  }

  /** Client command: fade everything out, bring the other track in. */
  crossfade(): void {
    if (this.closed) return;
    const now = Date.now();
    if (now - this.lastCrossfadeAt < 500) return; // ignore double-fires
    this.lastCrossfadeAt = now;
    for (const s of this.sources) {
      if (!s.dying) {
        s.targetGain = 0;
        s.dying = true;
      }
    }
    const file = this.pickTrack(this.currentFile);
    if (file) this.startSource(file);
  }

  private startEncoder(): void {
    const enc = spawn(
      'ffmpeg',
      [
        '-v', 'error',
        '-f', 's16le',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        '-i', 'pipe:0',
        '-f', 'mp3',
        '-b:a', '192k',
        'pipe:1',
      ],
      // stdin MUST be piped — 'ignore' gives ffmpeg an instant EOF
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    enc.stdout!.on('data', (chunk: Buffer) => {
      if (!this.out || this.out.writableEnded) return;
      const ok = this.out.write(chunk);
      if (!ok) {
        enc.stdout!.pause();
        this.out.once('drain', () => enc.stdout!.resume());
      }
    });
    this.encoderAlive = true;
    (enc.stderr as NodeJS.ReadableStream | null)?.on('data', (d: Buffer) =>
      console.error('[encoder]', d.toString().trim()),
    );
    enc.on('exit', (code) => {
      this.encoderAlive = false;
      console.error('[encoder] exited with code', code);
      if (this.closed) return;
      // Encoder died (transient) — restart after a beat
      if (this.encoderRetries++ < 5) setTimeout(() => { if (!this.closed) this.startEncoder(); }, 500);
    });
    this.encoder = enc;
  }

  /** Mix one tick of every source into a fresh PCM buffer. */
  private tick(): void {
    if (this.closed) return;
    this.ticks++;
    const n = BYTES_PER_TICK;
    const frames = n / FRAME_BYTES;
    const out = Buffer.alloc(n);
    const fadeFrames = Math.max(1, Math.round(FADE_S * SAMPLE_RATE));

    for (const s of this.sources) {
      // Consume exactly one tick of audio (pad underruns with silence)
      let need = n;
      const parts: Buffer[] = [];
      while (need > 0 && s.pending.length > 0) {
        const head = s.pending[0];
        const take = Math.min(need, head.length);
        parts.push(head.subarray(0, take));
        if (take === head.length) s.pending.shift();
        else s.pending[0] = head.subarray(take);
        need -= take;
      }
      if (need > 0) parts.push(Buffer.alloc(need));
      const src = Buffer.concat(parts, n);

      // Gain envelope: ramp per frame toward the target
      const step = (s.targetGain - s.gain) / fadeFrames;
      let g = s.gain;
      for (let f = 0; f < frames; f++) {
        for (let c = 0; c < CHANNELS; c++) {
          const off = f * FRAME_BYTES + c * 2;
          let sum = out.readInt16LE(off) + src.readInt16LE(off) * g;
          if (sum > 32767) sum = 32767;
          else if (sum < -32768) sum = -32768;
          out.writeInt16LE(sum, off);
        }
        g += step;
        if (step > 0 && g > s.targetGain) g = s.targetGain;
        else if (step < 0 && g < s.targetGain) g = s.targetGain;
      }
      s.gain = g;
    }

    // Retire fully faded sources
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const s = this.sources[i];
      if (s.dying && s.gain <= 0.002) {
        s.pending.length = 0;
        s.child.stdout?.destroy();
        s.child.kill('SIGKILL');
        this.sources.splice(i, 1);
      }
    }

    try {
      this.encoder?.stdin?.write(out);
    } catch {
      // EPIPE while restarting — next tick will land
    }
  }

  debug(): string {
    return JSON.stringify({
      ticks: this.ticks,
      encoderAlive: this.encoderAlive,
      closed: this.closed,
      sources: this.sources.map((s) => ({
        pending: s.pending.reduce((n, b) => n + b.length, 0),
        gain: s.gain,
        dying: s.dying,
      })),
      hasOut: this.out !== null,
    });
  }

  attach(res: ServerResponse): void {
    if (this.out && this.out !== res) {
      try { this.out.destroy(); } catch { /* old client */ }
    }
    this.out = res;
    res.on('close', () => {
      if (this.out === res) this.destroy();
    });
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    for (const s of this.sources) {
      s.pending.length = 0;
      s.child.stdout?.destroy();
      s.child.kill('SIGKILL');
    }
    this.sources = [];
    try { this.encoder?.stdin?.end(); } catch { /* already gone */ }
    this.encoder?.kill('SIGKILL');
    try { this.out?.end(); } catch { /* already gone */ }
    this.out = null;
    sessions.delete(this.id);
  }
}

const sessions = new Map<string, MusicSession>();

function getSession(id: string): MusicSession {
  let s = sessions.get(id);
  if (!s || s.isClosed()) {
    s = new MusicSession(id);
    sessions.set(id, s);
  }
  return s;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const id = url.searchParams.get('id') ?? '';
  const valid = ID_RE.test(id);

  if (url.pathname === '/music/stream' && valid) {
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    });
    getSession(id).attach(res);
    return;
  }
  if (url.pathname === '/music/crossfade' && valid) {
    sessions.get(id)?.crossfade();
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url.pathname === '/music/debug' && valid) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(sessions.get(id)?.debug() ?? '{}');
    return;
  }
  if (url.pathname === '/music/stop' && valid) {
    sessions.get(id)?.destroy();
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain' });
  res.end('not found');
}).listen(PORT, () => {
  console.log(`Music streaming server: http://localhost:${PORT}/music/stream`);
  console.log(`  Tracks: ${MUSIC_DIR}`);
});
