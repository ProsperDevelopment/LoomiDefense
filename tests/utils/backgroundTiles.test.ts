// ============================================================
// Global background tile ids: ranges, loads and legacy conversion.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TILESET_RANGES,
  TOTAL_TILE_COUNT,
  tileInfo,
  globalIdFor,
} from '../../src/utils/tileRanges';
import {
  collectBgTileLoads,
  bgTileKey,
  convertLegacyBgTiles,
} from '../../src/utils/backgroundTiles';

describe('TILESET_RANGES', () => {
  it('ranges are contiguous and sum to the total', () => {
    let expectedBase = 0;
    for (const r of TILESET_RANGES) {
      expect(r.base).toBe(expectedBase);
      expect(r.count).toBeGreaterThan(0);
      expectedBase += r.count;
    }
    expect(TOTAL_TILE_COUNT).toBe(expectedBase);
  });

  it('range counts match the shipped PNG files', () => {
    const root = join(process.cwd(), 'public', 'assets', 'tilesets');
    for (const r of TILESET_RANGES) {
      const pngs = readdirSync(join(root, r.folder)).filter((f) => f.endsWith('.png'));
      expect(pngs.length, `${r.folder} PNG count`).toBe(r.count);
      // files must be tile_000..tile_{count-1}
      const last = `tile_${(r.count - 1).toString().padStart(3, '0')}.png`;
      expect(pngs, `${r.folder} last tile`).toContain(last);
    }
  });

  it('range counts match the editor tile-data', () => {
    const raw = readFileSync(join(process.cwd(), 'editor', 'assets', 'tile-data.json'), 'utf8');
    const data = JSON.parse(raw) as Record<string, { tiles: unknown[] }>;
    for (const r of TILESET_RANGES) {
      expect(data[r.folder]?.tiles.length, `${r.folder} tile-data count`).toBe(r.count);
    }
  });
});

describe('tileInfo', () => {
  it('resolves ids across every tileset', () => {
    const nature = tileInfo(0);
    expect(nature).toMatchObject({ folder: 'TilesetNature', localId: 0, key: 'bg_0' });
    expect(nature?.url).toBe('assets/tilesets/TilesetNature/tile_000.png');

    const desertBase = TILESET_RANGES.find((r) => r.folder === 'TilesetDesert')!.base;
    const desert = tileInfo(desertBase + 42);
    expect(desert).toMatchObject({ folder: 'TilesetDesert', localId: 42, key: `bg_${desertBase + 42}` });
    expect(desert?.url).toBe('assets/tilesets/TilesetDesert/tile_042.png');
  });

  it('rejects unknown ids', () => {
    expect(tileInfo(-1)).toBeNull();
    expect(tileInfo(TOTAL_TILE_COUNT)).toBeNull();
    expect(tileInfo(1.5)).toBeNull();
  });
});

describe('globalIdFor', () => {
  it('maps folder + local id into the global range', () => {
    expect(globalIdFor('TilesetNature', 0)).toBe(0);
    expect(globalIdFor('TilesetDesert', 42)).toBe(
      TILESET_RANGES.find((r) => r.folder === 'TilesetDesert')!.base + 42,
    );
    expect(globalIdFor('TilesetDesert', 99999)).toBeNull();
    expect(globalIdFor('Nope', 0)).toBeNull();
  });
});

describe('collectBgTileLoads', () => {
  it('collects unique loads across mixed tilesets and skips empty cells', () => {
    const desertBase = TILESET_RANGES.find((r) => r.folder === 'TilesetDesert')!.base;
    const loads = collectBgTileLoads([
      [0, 1, -1],
      [1, desertBase + 7, -1],
    ]);
    expect(loads).toEqual([
      { key: 'bg_0', url: 'assets/tilesets/TilesetNature/tile_000.png' },
      { key: 'bg_1', url: 'assets/tilesets/TilesetNature/tile_001.png' },
      { key: `bg_${desertBase + 7}`, url: 'assets/tilesets/TilesetDesert/tile_007.png' },
    ]);
  });

  it('returns nothing for levels without a background layer', () => {
    expect(collectBgTileLoads(undefined)).toEqual([]);
    expect(collectBgTileLoads([[-1, -1]])).toEqual([]);
  });
});

describe('bgTileKey', () => {
  it('returns the texture key or empty for unknown ids', () => {
    expect(bgTileKey(0)).toBe('bg_0');
    expect(bgTileKey(-5)).toBe('');
    expect(bgTileKey(TOTAL_TILE_COUNT)).toBe('');
  });
});

describe('convertLegacyBgTiles', () => {
  it('converts local indices using the declared legacy tileset', () => {
    const desertBase = TILESET_RANGES.find((r) => r.folder === 'TilesetDesert')!.base;
    expect(convertLegacyBgTiles([[0, 42], [-1, 3]], 'desert_tile')).toEqual([
      [desertBase, desertBase + 42],
      [-1, desertBase + 3],
    ]);
    // folder-name spelling works too
    expect(convertLegacyBgTiles([[5]], 'TilesetNature')).toEqual([[5]]);
  });

  it('passes global ids through when no tileset is declared', () => {
    expect(convertLegacyBgTiles([[0, 1888, -1]], undefined)).toEqual([[0, 1888, -1]]);
    expect(convertLegacyBgTiles([[0]], '')).toEqual([[0]]);
  });

  it('returns undefined for missing or malformed layers', () => {
    expect(convertLegacyBgTiles(undefined, 'TilesetNature')).toBeUndefined();
    expect(convertLegacyBgTiles([], 'TilesetNature')).toBeUndefined();
    expect(convertLegacyBgTiles([1, 2], 'TilesetNature')).toBeUndefined();
    expect(convertLegacyBgTiles('nope', 'TilesetNature')).toBeUndefined();
  });
});
