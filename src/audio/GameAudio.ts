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
    if (target > 0 && musicWanted) startFreshTrack();
    return;
  }
  if (target <= 0) {
    stopMusicFade();
    musicEl.pause();
    return;
  }
  musicEl.volume = target;
  if (musicWanted && musicEl.paused && !musicEl.ended) {
    void musicEl.play().catch(() => undefined);
  }
}

// --- In-game music -------------------------------------------------
// Two long tracks streamed through HTML5 Audio (an hour of PCM would
// never fit in a WebAudio buffer). Every game start sounds an alert,
// then a second later picks a random track at a random position and
// fades it in; wave changes mix over to the other soundtrack.
const MUSIC_SRC = [
  'assets/audio/pow-pow.mp3',
  'assets/audio/Brainkillers - Weekend Rush 92.3 (July 31, 1994).mp3',
];
const MUSIC_FADE_MS = 1500;
let musicEl: HTMLAudioElement | null = null;
let musicWanted = false;
let musicFadeTimer: ReturnType<typeof setInterval> | null = null;
let alertStartTimer: ReturnType<typeof setTimeout> | null = null;

function stopMusicFade(): void {
  if (musicFadeTimer !== null) {
    clearInterval(musicFadeTimer);
    musicFadeTimer = null;
  }
}

function clearAlertStart(): void {
  if (alertStartTimer !== null) {
    clearTimeout(alertStartTimer);
    alertStartTimer = null;
  }
}

/** Ramp the element's volume up to the music setting over MUSIC_FADE_MS. */
function fadeMusicIn(el: HTMLAudioElement, fromZero: boolean = true): void {
  stopMusicFade();
  if (fromZero) el.volume = 0;
  const steps = Math.max(1, MUSIC_FADE_MS / 50);
  musicFadeTimer = setInterval(() => {
    if (musicEl !== el) { stopMusicFade(); return; }
    const target = musicVolumePct / 100;
    if (target <= 0) { stopMusicFade(); return; }
    if (el.volume > target) el.volume = target;
    else el.volume = Math.min(target, el.volume + target / steps);
    if (el.volume >= target) stopMusicFade();
  }, 50);
}

/** Start a track (random unless srcOverride) at a random position, faded in. */
function startFreshTrack(srcOverride?: string): void {
  stopMusicFade();
  musicEl?.pause();
  const el = new Audio();
  musicEl = el;
  el.preload = 'auto';
  el.volume = 0;
  el.addEventListener('loadedmetadata', () => {
    if (musicEl !== el) return;
    // Random start, staying clear of the final seconds
    if (Number.isFinite(el.duration) && el.duration > 30) {
      el.currentTime = Math.random() * (el.duration - 30);
    }
    void el.play().then(() => fadeMusicIn(el)).catch(() => {
      // Autoplay blocked — retry the moment the user interacts
      const retry = (): void => {
        window.removeEventListener('pointerdown', retry);
        if (musicEl !== el) return;
        void el.play().then(() => fadeMusicIn(el)).catch(() => undefined);
      };
      window.addEventListener('pointerdown', retry, { once: true });
    });
  }, { once: true });
  // A track missing at runtime (the109MB recording never deploys)
  // falls back to the always-present one instead of silencing music
  el.addEventListener('error', () => {
    if (musicEl !== el) return;
    if (!el.src.endsWith('pow-pow.mp3')) el.src = encodeURI(MUSIC_SRC[0]);
  });
  // A finished track hands over to another random pick
  el.addEventListener('ended', () => {
    if (musicWanted && musicVolumePct > 0 && musicEl === el) startFreshTrack();
  });
  el.src = encodeURI(
    srcOverride ?? MUSIC_SRC[Math.floor(Math.random() * MUSIC_SRC.length)],
  );
}

/** Mix over to the OTHER soundtrack (called when a wave starts). */
function crossfadeToOtherTrack(): void {
  if (!musicWanted || musicVolumePct <= 0) return;
  if (!musicEl) {
    // Music never got going (alert window) — begin it now
    startFreshTrack();
    return;
  }
  const old = musicEl;
  const curName = decodeURIComponent(old.src.split('/').pop() ?? '');
  const other = MUSIC_SRC.find(
    (src) => decodeURIComponent(src.split('/').pop() ?? '') !== curName,
  );
  if (!other) return;
  // Fade the current track out on its own timer while the new one fades in
  const steps = Math.max(1, MUSIC_FADE_MS / 50);
  const delta = old.volume / steps;
  let n = 0;
  const outTimer = setInterval(() => {
    old.volume = Math.max(0, old.volume - delta);
    if (++n >= steps || old.volume <= 0) {
      clearInterval(outTimer);
      if (old !== musicEl) old.pause();
    }
  }, 50);
  startFreshTrack(other);
}

/** Start the in-game music: alert first, then the track a second later. */
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
      if (musicWanted && musicVolumePct > 0) startFreshTrack();
    }, 1000);
    return;
  }
  startFreshTrack();
}

/** Stop the in-game music (scene shutdown). */
export function stopGameMusic(): void {
  musicWanted = false;
  clearAlertStart();
  stopMusicFade();
  musicEl?.pause();
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
    crossfadeToOtherTrack();
  });
  eventBus.on('wave-cleared', () => playSfx(scene, 'sfx_coin', { volume: 0.3, rate: 1.2 }));

  // Something got through to the base — a heavy thud
  eventBus.on('enemy-reached-base', () =>
    playSfx(scene, 'sfx_impact', { volume: 0.5, rate: 0.75 }),
  );
}
