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

describe('LevelLoader foreground markers (fgAreas)', () => {
  it('loads fg markers at background-tile resolution', () => {
    const level = loadLevelFromJSON({
      ...baseLevel,
      fgAreas: [
        ['fg', 'none'],
        ['fg', 'fg'],
      ],
    }, 1);

    expect(level.fgAreas).toEqual([
      ['fg', 'none'],
      ['fg', 'fg'],
    ]);
  });

  it('normalizes non-fg values to none', () => {
    const level = loadLevelFromJSON({
      ...baseLevel,
      fgAreas: [['fg', 'tree', 1, null]],
    }, 1);

    expect(level.fgAreas).toEqual([['fg', 'none', 'none', 'none']]);
  });

  it('rejects malformed layers', () => {
    expect(loadLevelFromJSON({ ...baseLevel, fgAreas: 'nope' }, 1).fgAreas).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, fgAreas: [] }, 1).fgAreas).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, fgAreas: [1, 2, 3] }, 1).fgAreas).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel }, 1).fgAreas).toBeUndefined();
  });
});

describe('LevelLoader background tile ids', () => {
  const base = {
    name: 'Tiles', description: '', width: 4, height: 3,
    path: [{ x: 0, y: 1 }], spawnPoints: [{ x: 0, y: 1 }], basePoints: [{ x: 3, y: 1 }],
  };

  it('passes global ids through when no tileset is declared', () => {
    const level = loadLevelFromJSON({ ...base, bgTiles: [[0, 700, -1]] }, 1);
    expect(level.bgTiles).toEqual([[0, 700, -1]]);
  });

  it('converts legacy tileset-local ids to global ids', () => {
    const level = loadLevelFromJSON(
      { ...base, tileset: 'desert_tile', bgTiles: [[0, 10]] },
      1,
    );
    // Desert starts at base 579 (TilesetDesert)
    expect(level.bgTiles).toEqual([[579, 589]]);
  });

  it('drops the tileset field entirely', () => {
    const level = loadLevelFromJSON(
      { ...base, tileset: 'TilesetNature', bgTiles: [[3]] },
      1,
    ) as unknown as Record<string, unknown>;
    expect('tileset' in level).toBe(false);
    expect(level.bgTiles).toEqual([[3]]);
  });

  it('handles missing background layers', () => {
    expect(loadLevelFromJSON({ ...base }, 1).bgTiles).toBeUndefined();
  });
});

// ============================================================
// LevelLoader: start gold.
// ============================================================
import { MAP_DEFINITIONS } from '../../src/data/maps';
import { STARTING_GOLD } from '../../src/config/constants';

describe('LevelLoader start gold', () => {
  it('loads startGold from the level JSON', () => {
    expect(loadLevelFromJSON({ ...baseLevel, startGold: 750 }, 1).startGold).toBe(750);
    expect(loadLevelFromJSON({ ...baseLevel, startGold: 0 }, 1).startGold).toBe(0);
    expect(loadLevelFromJSON({ ...baseLevel, startGold: 600.9 }, 1).startGold).toBe(600);
  });

  it('falls back to the game default when missing or invalid', () => {
    expect(loadLevelFromJSON({ ...baseLevel }, 1).startGold).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, startGold: 'lots' }, 1).startGold).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, startGold: -5 }, 1).startGold).toBeUndefined();
    expect(loadLevelFromJSON({ ...baseLevel, startGold: NaN }, 1).startGold).toBeUndefined();
  });

  it('defaults to 500 gold when the level does not set it', () => {
    expect(STARTING_GOLD).toBe(500);
    const level = loadLevelFromJSON({ ...baseLevel }, 1);
    expect(level.startGold ?? STARTING_GOLD).toBe(500);
  });

  it('every shipped level declares a non-negative startGold', () => {
    for (const level of MAP_DEFINITIONS) {
      expect(level.startGold, `level ${level.id}`).toBeTypeOf('number');
      expect(level.startGold!, `level ${level.id}`).toBeGreaterThanOrEqual(0);
    }
    expect(MAP_DEFINITIONS.find(l => l.id === 0)!.startGold).toBe(9999); // dev demo
  });
});

// ============================================================
// LevelLoader: tower build limits.
// ============================================================
describe('LevelLoader tower limits', () => {
  it('keeps valid per-type caps', () => {
    const level = loadLevelFromJSON(
      { ...baseLevel, towerLimits: { arrow: 5, sniper: 2 } },
      1,
    );
    expect(level.towerLimits).toEqual({ arrow: 5, sniper: 2 });
  });

  it('drops unknown types and invalid values, missing stays undefined', () => {
    expect(loadLevelFromJSON({ ...baseLevel }, 1).towerLimits).toBeUndefined();
    const level = loadLevelFromJSON(
      { ...baseLevel, towerLimits: { nope: 3, arrow: -1, tesla: 2.9, frost: 0 } },
      1,
    );
    expect(level.towerLimits).toEqual({ tesla: 2, frost: 0 });
  });
});
