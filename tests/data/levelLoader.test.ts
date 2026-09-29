// ============================================================
// LevelLoader: custom wave definitions from level JSON.
// ============================================================
import { describe, it, expect } from 'vitest';
import { loadLevelFromJSON } from '../../src/data/LevelLoader';

const baseLevel = {
  name: 'Test',
  description: '',
  width: 4,
  height: 3,
  path: [{ x: 0, y: 1 }],
  spawnPoints: [{ x: 0, y: 1 }],
  basePoints: [{ x: 3, y: 1 }],
};

describe('LevelLoader wave definitions', () => {
  it('loads custom waves and re-numbers them by position', () => {
    const level = loadLevelFromJSON({
      ...baseLevel,
      waves: [
        { waveNumber: 99, entries: [{ enemyType: 'basic', count: 10, spawnDelay: 500, waveDelay: 0 }] },
        { entries: [{ enemyType: 'fast', count: 5, spawnDelay: 300, waveDelay: 1000 }] },
      ],
    }, 1);

    expect(level.waves).toHaveLength(2);
    expect(level.waves![0].waveNumber).toBe(1);
    expect(level.waves![1].waveNumber).toBe(2);
    expect(level.waves![0].entries[0]).toEqual({
      enemyType: 'basic', count: 10, spawnDelay: 500, waveDelay: 0,
    });
    expect(level.waves![1].entries[0].enemyType).toBe('fast');
  });

  it('drops malformed entries and unknown enemy types', () => {
    const level = loadLevelFromJSON({
      ...baseLevel,
      waves: [
        { entries: [
          { enemyType: 'ghost', count: 5 },        // unknown enemy
          { enemyType: 'basic', count: 0 },         // count below 1
          { enemyType: 'tank', count: 3.7, spawnDelay: -5, waveDelay: -1 },
          { enemyType: 'boss' },                    // missing count
        ] },
        { entries: [] },                            // empty wave
      ],
    }, 1);

    expect(level.waves).toHaveLength(1);
    expect(level.waves![0].entries).toHaveLength(1);
    expect(level.waves![0].entries[0]).toEqual({
      enemyType: 'tank', count: 3, spawnDelay: 0, waveDelay: 0,
    });
  });

  it('falls back to the game defaults when waves are unusable', () => {
    expect(loadLevelFromJSON({ ...baseLevel }, 1).waves).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, waves: [] }, 1).waves).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, waves: 'nope' }, 1).waves).toBeUndefined();
    expect(
      loadLevelFromJSON({ ...baseLevel, waves: [{ entries: [{ enemyType: 'ghost', count: 9 }] }] }, 1).waves,
    ).toBeUndefined();
  });

  it('clamps delays and counts to sane values', () => {
    const level = loadLevelFromJSON({
      ...baseLevel,
      waves: [{ entries: [{ enemyType: 'basic', count: '12', spawnDelay: '800', waveDelay: '250' }] }],
    }, 1);

    expect(level.waves![0].entries[0]).toEqual({
      enemyType: 'basic', count: 12, spawnDelay: 800, waveDelay: 250,
    });
  });
});
