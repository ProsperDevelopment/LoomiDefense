// ============================================================
// Event-driven sound effects.
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

const MUTED_KEY = 'loomi_sfx_muted';

export function isSfxMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSfxMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // storage unavailable — mute just won't persist
  }
  // Keep the music in sync with the toggle while a game is running
  if (muted) pauseMusicNow();
  else if (musicWanted) playMusicNow();
}

// --- In-game music -------------------------------------------------
// Two long tracks streamed through HTML5 Audio (an hour of PCM would
// never fit in a WebAudio buffer). Every game start picks a random
// track, begins at a random position and fades in; when a track runs
// out a fresh random pick takes over.
const MUSIC_SRC = [
  'assets/audio/pow-pow.mp3',
  'assets/audio/Brainkillers - Weekend Rush 92.3 (July 31, 1994).mp3',
];
const MUSIC_VOLUME = 0.3;
const MUSIC_FADE_MS = 1500;
let musicEl: HTMLAudioElement | null = null;
let musicWanted = false;
let musicFadeTimer: ReturnType<typeof setInterval> | null = null;

function stopMusicFade(): void {
  if (musicFadeTimer !== null) {
    clearInterval(musicFadeTimer);
    musicFadeTimer = null;
  }
}

/** Ramp the element's volume up over MUSIC_FADE_MS. */
function fadeMusicIn(el: HTMLAudioElement, fromZero: boolean = true): void {
  stopMusicFade();
  if (fromZero) el.volume = 0;
  const steps = Math.max(1, MUSIC_FADE_MS / 50);
  const delta = MUSIC_VOLUME / steps;
  musicFadeTimer = setInterval(() => {
    if (musicEl !== el) { stopMusicFade(); return; }
    el.volume = Math.min(MUSIC_VOLUME, el.volume + delta);
    if (el.volume >= MUSIC_VOLUME) stopMusicFade();
  }, 50);
}

/** Pick a random track and start it at a random position, faded in. */
function startFreshTrack(): void {
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
    if (musicWanted && !isSfxMuted() && musicEl === el) startFreshTrack();
  });
  el.src = encodeURI(MUSIC_SRC[Math.floor(Math.random() * MUSIC_SRC.length)]);
}

/** Resume the current track (unmute) or start one if none exists. */
function playMusicNow(): void {
  if (!musicEl || musicEl.ended) { startFreshTrack(); return; }
  if (musicEl.paused) {
    void musicEl.play().then(() => {
      // A mute during a fade left the volume short — ramp the rest in
      if (musicEl && musicEl.volume < MUSIC_VOLUME) fadeMusicIn(musicEl, false);
    }).catch(() => undefined);
  }
}

function pauseMusicNow(): void {
  stopMusicFade();
  musicEl?.pause();
}

/** Start the in-game music: random track, random position, fade in. */
export function startGameMusic(): void {
  musicWanted = true;
  if (isSfxMuted()) return;
  startFreshTrack();
}

/** Stop the in-game music (scene shutdown). */
export function stopGameMusic(): void {
  musicWanted = false;
  stopMusicFade();
  musicEl?.pause();
}

/** Play a loaded sound key, respecting the mute toggle. */
export function playSfx(
  scene: Phaser.Scene,
  key: string,
  opts: { volume?: number; rate?: number } = {},
): void {
  if (isSfxMuted()) return;
  if (!scene.sound) return;
  try {
    scene.sound.play(key, {
      volume: opts.volume ?? 0.4,
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

  // Building: the old thud, now with sawing on top
  eventBus.on('tower-placed', () => {
    playSfx(scene, 'sfx_build', { volume: 0.4 });
    playSfx(scene, 'sfx_saw', { volume: 0.3, rate: 1.05 + Math.random() * 0.15 });
  });
  eventBus.on('tower-upgraded', () => playSfx(scene, 'sfx_upgrade', { volume: 0.4 }));
  eventBus.on('tower-sold', () => playSfx(scene, 'sfx_coin', { volume: 0.4, rate: 1.05 }));

  // Waves: the old horn plus a random siren/alarm
  eventBus.on('wave-started', () => {
    playSfx(scene, 'sfx_wave', { volume: 0.3 });
    const alerts = ['sfx_siren', 'sfx_alarm', 'sfx_siren2'];
    playSfx(scene, alerts[Math.floor(Math.random() * alerts.length)], {
      volume: 0.22,
      rate: 0.95 + Math.random() * 0.1,
    });
  });
  eventBus.on('wave-cleared', () => playSfx(scene, 'sfx_coin', { volume: 0.3, rate: 1.2 }));

  // Something got through to the base — a heavy thud
  eventBus.on('enemy-reached-base', () =>
    playSfx(scene, 'sfx_impact', { volume: 0.5, rate: 0.75 }),
  );
}
