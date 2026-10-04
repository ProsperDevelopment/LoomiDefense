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
  arrow: { key: 'sfx_slash', volume: 0.25 },
  cannon: { key: 'sfx_impact', volume: 0.3 },
  frost: { key: 'sfx_magic', volume: 0.25 },
  sniper: { key: 'sfx_slash2', volume: 0.3 },
  mortar: { key: 'sfx_fireball', volume: 0.3 },
  tesla: { key: 'sfx_fx', volume: 0.25 },
  grenade: { key: 'sfx_fireball', volume: 0.35 },
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

  // Building
  eventBus.on('tower-placed', () => playSfx(scene, 'sfx_build', { volume: 0.4 }));
  eventBus.on('tower-upgraded', () => playSfx(scene, 'sfx_upgrade', { volume: 0.4 }));
  eventBus.on('tower-sold', () => playSfx(scene, 'sfx_coin', { volume: 0.4, rate: 1.05 }));

  // Waves
  eventBus.on('wave-started', () => playSfx(scene, 'sfx_wave', { volume: 0.3 }));
  eventBus.on('wave-cleared', () => playSfx(scene, 'sfx_coin', { volume: 0.3, rate: 1.2 }));

  // Something got through to the base — a heavy thud
  eventBus.on('enemy-reached-base', () =>
    playSfx(scene, 'sfx_impact', { volume: 0.5, rate: 0.75 }),
  );
}
