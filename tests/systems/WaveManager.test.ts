import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveManager } from '../../src/systems/WaveManager';
import { eventBus } from '../../src/utils/EventBus';
import type { WaveData, EnemyType } from '../../src/types';

// Minimal mock wave data
const mockWaves: WaveData[] = [
  {
    waveNumber: 1,
    entries: [
      { enemyType: 'basic', count: 3, spawnDelay: 100, waveDelay: 0 },
    ],
  },
  {
    waveNumber: 2,
    entries: [
      { enemyType: 'fast', count: 2, spawnDelay: 80, waveDelay: 0 },
      { enemyType: 'armored', count: 1, spawnDelay: 200, waveDelay: 500 },
    ],
  },
];

describe('WaveManager', () => {
  let wm: WaveManager;

  beforeEach(() => {
    wm = new WaveManager(mockWaves);
  });

  it('starts with wave 1', () => {
    expect(wm.getWaveNumber()).toBe(1);
    expect(wm.getTotalWaves()).toBe(2);
    expect(wm.isComplete()).toBe(false);
  });

  it('starts a wave', () => {
    const result = wm.startWave();
    expect(result).toBe(true);
    expect(wm.isWaveActive()).toBe(true);
  });

  it('cannot start wave twice', () => {
    wm.startWave();
    const result = wm.startWave();
    expect(result).toBe(false);
  });

  it('spawns enemies via callback', () => {
    const onSpawn = vi.fn();
    wm.onSpawnEnemy = onSpawn;
    wm.startWave();

    // Advance enough time to trigger spawns
    wm.update(200);
    expect(onSpawn).toHaveBeenCalled();
  });

  it('completes wave and advances', () => {
    wm.startWave();
    wm.completeWave();
    expect(wm.isWaveActive()).toBe(false);
    expect(wm.getWaveNumber()).toBe(2);
  });

  it('emits wave-cleared event', () => {
    const spy = vi.fn();
    eventBus.on('wave-cleared', spy);

    wm.startWave();
    wm.completeWave();
    expect(spy).toHaveBeenCalledWith({ waveNumber: 1 });

    eventBus.off('wave-cleared', spy);
  });

  it('detects all waves complete', () => {
    wm.startWave();
    wm.completeWave();
    wm.startWave();
    wm.completeWave();
    expect(wm.isComplete()).toBe(true);
  });

  it('resets correctly', () => {
    wm.startWave();
    wm.completeWave();
    wm.reset();
    expect(wm.getWaveNumber()).toBe(1);
    expect(wm.isComplete()).toBe(false);
    expect(wm.isWaveActive()).toBe(false);
  });

  it('does not update when not active', () => {
    const onSpawn = vi.fn();
    wm.onSpawnEnemy = onSpawn;
    wm.update(1000);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('returns null for current wave when complete', () => {
    wm.startWave();
    wm.completeWave();
    wm.startWave();
    wm.completeWave();
    expect(wm.getCurrentWave()).toBeNull();
  });
});
