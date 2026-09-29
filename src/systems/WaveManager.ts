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
 * Supports auto-start with countdown and early start bonus.
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

  // Auto-start settings
  private autoStartDelay: number = 15000; // 15 seconds
  private autoStartTimer: number = 0;
  private autoStartEnabled: boolean = true;
  private waitingForNextWave: boolean = false;

  // Early start bonus
  private earlyStartBonus: number = 50;

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

  isWaitingForNextWave(): boolean {
    return this.waitingForNextWave;
  }

  getAutoStartTimer(): number {
    return Math.ceil((this.autoStartDelay - this.autoStartTimer) / 1000);
  }

  getEarlyStartBonus(): number {
    return this.earlyStartBonus;
  }

  getEnemiesSpawnedInWave(): number {
    return this.enemiesSpawnedThisWave;
  }

  getTotalEnemiesInWave(): number {
    return this.totalEnemiesInWave;
  }

  /**
   * Start the first wave manually or trigger auto-start countdown
   */
  startFirstWave(): void {
    if (this.currentWaveIndex === 0 && !this.waveActive && !this.waitingForNextWave) {
      this.startWave();
    }
  }

  /**
   * Start the current wave
   */
  startWave(): boolean {
    if (this.waveActive || this.isComplete()) return false;

    const wave = this.waves[this.currentWaveIndex];
    this.waveActive = true;
    this.waitingForNextWave = false;
    this.waveTimer = 0;
    this.autoStartTimer = 0;
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
   * Start wave early for bonus gold
   */
  startWaveEarly(): number {
    if (!this.waitingForNextWave || this.waveActive) return 0;

    const bonus = this.earlyStartBonus;
    this.startWave();
    return bonus;
  }

  /**
   * Called when wave is cleared, starts auto-start countdown
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
    } else {
      // Start auto-start countdown
      this.waitingForNextWave = true;
      this.autoStartTimer = 0;
    }

    this.onWaveCleared?.(waveNumber);
  }

  update(deltaMs: number): void {
    // Handle auto-start countdown
    if (this.waitingForNextWave && !this.waveActive) {
      this.autoStartTimer += deltaMs;
      if (this.autoStartTimer >= this.autoStartDelay) {
        this.startWave();
      }
      return;
    }

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
  }

  reset(): void {
    this.currentWaveIndex = 0;
    this.entries = [];
    this.entryTimers = [];
    this.waveTimer = 0;
    this.waveActive = false;
    this.waitingForNextWave = false;
    this.autoStartTimer = 0;
    this.enemiesSpawnedThisWave = 0;
    this.totalEnemiesInWave = 0;
  }
}
