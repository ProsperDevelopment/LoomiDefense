// ============================================================
// Event-driven sound effects and in-game music.
//
// bindGameAudio() subscribes gameplay sounds to the event bus —
// call it after eventBus.clear() in the scene's create().
// ============================================================
import { eventBus } from '../utils/EventBus';
import type { TowerType } from '../types';

// Partial: towers that never fire (farm) have no shot sound.
const SHOT_SFX: Partial<Record<TowerType, { key: string; volume: number }>> = {
  arrow: { key: 'sfx_bow', volume: 0.35 },
  cannon: { key: 'sfx_impact', volume: 0.3 },
  frost: { key: 'sfx_magic', volume: 0.25 },
  sniper: { key: 'sfx_slash2', volume: 0.3 },
  mortar: { key: 'sfx_fireball', volume: 0.3 },
  tesla: { key: 'sfx_fx', volume: 0.25 },
  grenade: { key: 'sfx_grenade_throw', volume: 0.35 },
};

const DEATH_SFX = ['sfx_hit1', 'sfx_hit5', 'sfx_hit9'];

// --- Volumes (persisted0..100) ----------------------------------
const SFX_VOL_KEY = 'loomi_sfx_vol';
const MUSIC_VOL_KEY = 'loomi_music_vol';
const LEGACY_MUTED_KEY = 'loomi_sfx_muted'; // pre-volume builds

function loadVolumePct(key: string, def: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Math.round(Number(raw));
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    }
    // One-time migration from the old on/off toggle
    if (localStorage.getItem(LEGACY_MUTED_KEY) === '1') return 0;
  } catch {
    // storage unavailable — defaults win
  }
  return def;
}

let sfxVolumePct = loadVolumePct(SFX_VOL_KEY, 100);
let musicVolumePct = loadVolumePct(MUSIC_VOL_KEY, 30);

export function getSfxVolume(): number {
  return sfxVolumePct;
}

export function setSfxVolume(pct: number): void {
  sfxVolumePct = Math.max(0, Math.min(100, Math.round(pct)));
  try {
    localStorage.setItem(SFX_VOL_KEY, String(sfxVolumePct));
  } catch {
    // storage unavailable — the level just won't persist
  }
}

export function getMusicVolume(): number {
  return musicVolumePct;
}

export function setMusicVolume(pct: number): void {
  musicVolumePct = Math.max(0, Math.min(100, Math.round(pct)));
  try {
    localStorage.setItem(MUSIC_VOL_KEY, String(musicVolumePct));
  } catch {
    // storage unavailable — the level just won't persist
  }
  applyMusicVolumeNow();
}

/** Push the music setting onto the live element (pause at0, resume above). */
function applyMusicVolumeNow(): void {
  const target = musicVolumePct / 100;
  if (!musicEl) {
    // Volume raised during a game that never got music (was at zero)
    if (target > 0 && musicWanted) connectMusicStream();
    return;
  }
  if (target <= 0) {
    musicEl.pause();
    return;
  }
  musicEl.volume = target;
  if (musicWanted && musicEl.paused && !musicEl.ended) {
    void musicEl.play().catch(() => undefined);
  }
}

// --- In-game music -------------------------------------------------
// The music is mixed and streamed by the separate music server
// (server/music.ts, port4001): random track, random position, fade-ins
// and wave crossfades all happen server-side — the browser only gets
// one continuous192kbps MP3 stream instead of the full track files.
const MUSIC_PORT = 4001;
let musicEl: HTMLAudioElement | null = null;
let musicSessionId: string | null = null;
let musicWanted = false;
let alertStartTimer: ReturnType<typeof setTimeout> | null = null;

function musicBaseUrl(): string {
  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'localhost';
  return `http://${host}:${MUSIC_PORT}`;
}

function clearAlertStart(): void {
  if (alertStartTimer !== null) {
    clearTimeout(alertStartTimer);
    alertStartTimer = null;
  }
}

/** Fire a command at the music server for the current session. */
function musicCommand(cmd: 'crossfade' | 'stop'): void {
  if (!musicSessionId) return;
  void fetch(`${musicBaseUrl()}/music/${cmd}?id=${encodeURIComponent(musicSessionId)}`).catch(
    () => {
      // Music server offline — stay silent
    },
  );
}

/** Open a fresh stream (its own session) from the music server. */
function connectMusicStream(): void {
  musicEl?.pause();
  const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  musicSessionId = id;
  const el = new Audio(`${musicBaseUrl()}/music/stream?id=${encodeURIComponent(id)}`);
  el.volume = musicVolumePct / 100;
  musicEl = el;
  void el.play().catch(() => {
    // Autoplay blocked — retry the moment the user interacts
    const retry = (): void => {
      window.removeEventListener('pointerdown', retry);
      if (musicEl !== el) return;
      void el.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', retry, { once: true });
  });
}

/** Mix over to the other track (server-side crossfade). */
function crossfadeMusic(): void {
  if (musicWanted && musicVolumePct > 0) musicCommand('crossfade');
}

/** Start the in-game music: alert first, then the stream a second later. */
export function startGameMusic(scene?: Phaser.Scene): void {
  musicWanted = true;
  clearAlertStart();
  if (musicVolumePct <= 0) return;
  if (scene) {
    // Horn + a random siren/alarm announce the new play…
    playSfx(scene, 'sfx_wave', { volume: 0.32 });
    const alerts = ['sfx_siren', 'sfx_alarm', 'sfx_siren2'];
    playSfx(scene, alerts[Math.floor(Math.random() * alerts.length)], {
      volume: 0.28,
    });
    // …and the soundtrack joins one second later
    alertStartTimer = setTimeout(() => {
      alertStartTimer = null;
      if (musicWanted && musicVolumePct > 0) connectMusicStream();
    }, 1000);
    return;
  }
  connectMusicStream();
}

/** Stop the in-game music and release the server session. */
export function stopGameMusic(): void {
  musicWanted = false;
  clearAlertStart();
  musicCommand('stop');
  musicEl?.pause();
  musicEl = null;
  musicSessionId = null;
}

/** Play a loaded sound key, scaled by the SFX volume setting. */
export function playSfx(
  scene: Phaser.Scene,
  key: string,
  opts: { volume?: number; rate?: number } = {},
): void {
  if (sfxVolumePct <= 0) return;
  if (!scene.sound) return;
  try {
    scene.sound.play(key, {
      volume: (opts.volume ?? 0.4) * (sfxVolumePct / 100),
      rate: opts.rate ?? 1,
    });
  } catch {
    // key not loaded (e.g. scene shutting down) — ignore
  }
}

/**
 * Subscribe gameplay sounds to the event bus. Called from
 * GameScene.setupEvents() — eventBus.clear() unbinds it again.
 */
export function bindGameAudio(scene: Phaser.Scene): void {
  // Shots: a distinct sound per tower type, slightly pitch-shifted so
  // repeated fire from several towers doesn't sound machine-gunned
  eventBus.on('projectile-fired', ({ towerType }) => {
    const shot = SHOT_SFX[towerType];
    if (shot) {
      playSfx(scene, shot.key, {
        volume: shot.volume,
        rate: 0.92 + Math.random() * 0.16,
      });
    }
  });

  // Deaths: random hit from a small set, a touch faster than recorded
  eventBus.on('enemy-killed', () => {
    const key = DEATH_SFX[Math.floor(Math.random() * DEATH_SFX.length)];
    playSfx(scene, key, { volume: 0.3, rate: 0.95 + Math.random() * 0.25 });
  });

  // Building: sawing only
  eventBus.on('tower-placed', () => {
    playSfx(scene, 'sfx_saw', { volume: 0.3, rate: 1.05 + Math.random() * 0.15 });
  });
  eventBus.on('tower-upgraded', () => playSfx(scene, 'sfx_upgrade', { volume: 0.4 }));
  eventBus.on('tower-sold', () => playSfx(scene, 'sfx_coin', { volume: 0.4, rate: 1.05 }));

  // Waves: the old horn plus a random siren/alarm, and the music
  // mixes over to the other soundtrack
  eventBus.on('wave-started', () => {
    playSfx(scene, 'sfx_wave', { volume: 0.3 });
    const alerts = ['sfx_siren', 'sfx_alarm', 'sfx_siren2'];
    playSfx(scene, alerts[Math.floor(Math.random() * alerts.length)], {
      volume: 0.22,
      rate: 0.95 + Math.random() * 0.1,
    });
  });
  // Wave done -> ask the music server to mix over to the other track
  eventBus.on('wave-cleared', () => {
    playSfx(scene, 'sfx_coin', { volume: 0.3, rate: 1.2 });
    crossfadeMusic();
  });

  // Something got through to the base — a heavy thud
  eventBus.on('enemy-reached-base', () =>
    playSfx(scene, 'sfx_impact', { volume: 0.5, rate: 0.75 }),
  );
}
