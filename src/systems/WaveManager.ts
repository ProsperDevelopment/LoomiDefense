import type { WaveData, EnemyType, EventPayload } from '../types';
import { WAVE_DEFINITIONS } from '../data/waves';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import { eventBus } from '../utils/EventBus';

interface SpawnEntry {
  enemyType: EnemyType;
  spawnDelay: number;
  elapsed: number;
  remaining: number;
}

/**
 * Manages wave spawning logic.
 * Tracks current wave, spawning timers, and wave completion.
 */
export class WaveManager {
  private waves: WaveData[];
  private currentWaveIndex: number = 0;
  private entries: SpawnEntry[] = [];
  private entryTimers: number[] = [];
  private activeEntryIndex: number = 0;
  private waveTimer: number = 0;
  private waveActive: boolean = false;
  private totalEnemiesInWave: number = 0;
  private enemiesSpawnedThisWave: number = 0;

  // Callbacks
  onSpawnEnemy: ((enemyType: EnemyType) => void) | null = null;
  onWaveCleared: ((waveNumber: number) => void) | null = null;
  onAllWavesCleared: (() => void) | null = null;

  constructor(waves: WaveData[] = WAVE_DEFINITIONS) {
    this.waves = waves;
  }

  getCurrentWave(): WaveData | null {
    if (this.currentWaveIndex < this.waves.length) {
      return this.waves[this.currentWaveIndex];
    }
    return null;
  }

  getWaveNumber(): number {
    return this.currentWaveIndex + 1;
  }

  getTotalWaves(): number {
    return this.waves.length;
  }

  isComplete(): boolean {
    return this.currentWaveIndex >= this.waves.length;
  }

  isWaveActive(): boolean {
    return this.waveActive;
  }

  getEnemiesSpawnedInWave(): number {
    return this.enemiesSpawnedThisWave;
  }

  getTotalEnemiesInWave(): number {
    return this.totalEnemiesInWave;
  }

  startWave(): boolean {
    if (this.waveActive || this.isComplete()) return false;

    const wave = this.waves[this.currentWaveIndex];
    this.waveActive = true;
    this.waveTimer = 0;
    this.entries = [];
    this.entryTimers = [];
    this.activeEntryIndex = 0;
    this.enemiesSpawnedThisWave = 0;
    this.totalEnemiesInWave = 0;

    for (const entry of wave.entries) {
      this.entries.push({
        enemyType: entry.enemyType,
        spawnDelay: entry.spawnDelay,
        elapsed: entry.waveDelay,
        remaining: entry.count,
      });
      this.entryTimers.push(entry.waveDelay);
      this.totalEnemiesInWave += entry.count;
    }

    eventBus.emit('wave-started', { waveNumber: wave.waveNumber });
    return true;
  }

  /**
   * Returns the number of enemies currently alive in the wave.
   * Called externally by GameScene to track wave completion.
   */
  onEnemyDied(): void {
    // Wave completion is tracked externally
  }

  update(deltaMs: number): void {
    if (!this.waveActive) return;

    this.waveTimer += deltaMs;

    let allDone = true;

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.remaining <= 0) continue;

      allDone = false;

      this.entryTimers[i] -= deltaMs;

      if (this.entryTimers[i] <= 0) {
        // Spawn an enemy
        this.onSpawnEnemy?.(entry.enemyType);
        this.enemiesSpawnedThisWave++;

        eventBus.emit('enemy-spawned', {
          enemyType: entry.enemyType,
          waveNumber: this.getWaveNumber(),
        });

        entry.remaining--;
        this.entryTimers[i] = entry.spawnDelay;
      }
    }

    // Check if all entries are done spawning
    if (allDone && this.waveActive) {
      // Wave spawning is complete; GameScene tracks when all enemies are dead
    }
  }

  /**
   * Call when all enemies in a wave are dead or have reached base.
   */
  completeWave(): void {
    if (!this.waveActive) return;

    const waveNumber = this.getWaveNumber();
    this.waveActive = false;
    this.currentWaveIndex++;

    eventBus.emit('wave-cleared', { waveNumber });

    if (this.isComplete()) {
      eventBus.emit('all-waves-cleared', {});
      this.onAllWavesCleared?.();
    }

    this.onWaveCleared?.(waveNumber);
  }

  reset(): void {
    this.currentWaveIndex = 0;
    this.entries = [];
    this.entryTimers = [];
    this.waveTimer = 0;
    this.waveActive = false;
    this.enemiesSpawnedThisWave = 0;
    this.totalEnemiesInWave = 0;
  }
}
