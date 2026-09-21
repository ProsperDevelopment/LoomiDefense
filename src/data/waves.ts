import type { WaveData } from '../types';

export const WAVE_DEFINITIONS: WaveData[] = [
  {
    waveNumber: 1,
    entries: [
      { enemyType: 'basic', count: 5, spawnDelay: 1000, waveDelay: 0 },
    ],
  },
  {
    waveNumber: 2,
    entries: [
      { enemyType: 'basic', count: 8, spawnDelay: 900, waveDelay: 0 },
    ],
  },
  {
    waveNumber: 3,
    entries: [
      { enemyType: 'basic', count: 5, spawnDelay: 800, waveDelay: 0 },
      { enemyType: 'fast', count: 4, spawnDelay: 600, waveDelay: 5000 },
    ],
  },
  {
    waveNumber: 4,
    entries: [
      { enemyType: 'fast', count: 8, spawnDelay: 500, waveDelay: 0 },
      { enemyType: 'basic', count: 4, spawnDelay: 1000, waveDelay: 3000 },
    ],
  },
  {
    waveNumber: 5,
    entries: [
      { enemyType: 'basic', count: 6, spawnDelay: 800, waveDelay: 0 },
      { enemyType: 'armored', count: 3, spawnDelay: 2000, waveDelay: 3000 },
    ],
  },
  {
    waveNumber: 6,
    entries: [
      { enemyType: 'fast', count: 10, spawnDelay: 400, waveDelay: 0 },
      { enemyType: 'armored', count: 4, spawnDelay: 1500, waveDelay: 2000 },
    ],
  },
  {
    waveNumber: 7,
    entries: [
      { enemyType: 'armored', count: 6, spawnDelay: 1200, waveDelay: 0 },
      { enemyType: 'basic', count: 10, spawnDelay: 600, waveDelay: 2000 },
      { enemyType: 'fast', count: 8, spawnDelay: 400, waveDelay: 6000 },
    ],
  },
  {
    waveNumber: 8,
    entries: [
      { enemyType: 'basic', count: 15, spawnDelay: 500, waveDelay: 0 },
      { enemyType: 'fast', count: 12, spawnDelay: 350, waveDelay: 3000 },
      { enemyType: 'armored', count: 5, spawnDelay: 1500, waveDelay: 7000 },
    ],
  },
  {
    waveNumber: 9,
    entries: [
      { enemyType: 'armored', count: 10, spawnDelay: 1000, waveDelay: 0 },
      { enemyType: 'fast', count: 15, spawnDelay: 300, waveDelay: 4000 },
    ],
  },
  {
    waveNumber: 10,
    entries: [
      { enemyType: 'basic', count: 20, spawnDelay: 400, waveDelay: 0 },
      { enemyType: 'fast', count: 15, spawnDelay: 300, waveDelay: 3000 },
      { enemyType: 'armored', count: 8, spawnDelay: 1200, waveDelay: 6000 },
    ],
  },
];
