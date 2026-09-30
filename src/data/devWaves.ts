import type { WaveData } from '../types';

/**
 * Special waves for the dev demo level (id 0).
 * Moved out of GameScene so tooling can import it without loading Phaser.
 * The level JSON (level0.json) is the source of truth at runtime.
 */
export const DEV_DEMO_WAVES: WaveData[] = [
  {
    waveNumber: 1,
    entries: [
      { enemyType: 'basic', count: 3, spawnDelay: 500, waveDelay: 0 },
      { enemyType: 'fast', count: 3, spawnDelay: 500, waveDelay: 2000 },
      { enemyType: 'armored', count: 2, spawnDelay: 800, waveDelay: 4000 },
      { enemyType: 'healer', count: 2, spawnDelay: 800, waveDelay: 6000 },
      { enemyType: 'swarm', count: 5, spawnDelay: 300, waveDelay: 8000 },
      { enemyType: 'tank', count: 1, spawnDelay: 1500, waveDelay: 10000 },
      { enemyType: 'elite', count: 1, spawnDelay: 1000, waveDelay: 12000 },
      { enemyType: 'boss', count: 1, spawnDelay: 0, waveDelay: 15000 },
    ],
  },
  {
    waveNumber: 2,
    entries: [
      { enemyType: 'basic', count: 5, spawnDelay: 400, waveDelay: 0 },
      { enemyType: 'fast', count: 5, spawnDelay: 400, waveDelay: 1000 },
      { enemyType: 'armored', count: 3, spawnDelay: 600, waveDelay: 2000 },
      { enemyType: 'healer', count: 3, spawnDelay: 600, waveDelay: 3000 },
      { enemyType: 'swarm', count: 10, spawnDelay: 200, waveDelay: 4000 },
      { enemyType: 'tank', count: 2, spawnDelay: 1200, waveDelay: 6000 },
      { enemyType: 'elite', count: 2, spawnDelay: 800, waveDelay: 8000 },
      { enemyType: 'boss', count: 2, spawnDelay: 2000, waveDelay: 10000 },
    ],
  },
];
