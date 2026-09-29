// ============================================================
// On-demand background tile loading helpers.
// ============================================================
import { describe, it, expect } from 'vitest';
import { resolveTilesetAssets, collectBgTileLoads } from '../../src/utils/backgroundTiles';

describe('resolveTilesetAssets', () => {
  it('maps texture-prefix spellings (old levels)', () => {
    expect(resolveTilesetAssets('nature_tile')).toEqual({ prefix: 'nature_tile', folder: 'TilesetNature' });
    expect(resolveTilesetAssets('desert_tile')).toEqual({ prefix: 'desert_tile', folder: 'TilesetDesert' });
  });

  it('maps folder-name spellings (editor exports)', () => {
    expect(resolveTilesetAssets('TilesetNature')).toEqual({ prefix: 'nature_tile', folder: 'TilesetNature' });
    expect(resolveTilesetAssets('TilesetDesert')).toEqual({ prefix: 'desert_tile', folder: 'TilesetDesert' });
    expect(resolveTilesetAssets('TilesetField')).toEqual({ prefix: 'field_tile', folder: 'TilesetField' });
  });

  it('falls back to nature for unknown/missing tilesets', () => {
    expect(resolveTilesetAssets(undefined).folder).toBe('TilesetNature');
    expect(resolveTilesetAssets('TilesetBogus').folder).toBe('TilesetNature');
  });
});

describe('collectBgTileLoads', () => {
  it('collects unique, deduplicated loads and skips empty cells', () => {
    const loads = collectBgTileLoads({
      tileset: 'TilesetNature',
      bgTiles: [
        [0, 1, -1],
        [1, -1, 5],
      ],
    });
    expect(loads).toEqual([
      { key: 'nature_tile_000', url: 'assets/tilesets/TilesetNature/tile_000.png' },
      { key: 'nature_tile_001', url: 'assets/tilesets/TilesetNature/tile_001.png' },
      { key: 'nature_tile_005', url: 'assets/tilesets/TilesetNature/tile_005.png' },
    ]);
  });

  it('uses the desert folder for desert levels', () => {
    const loads = collectBgTileLoads({ tileset: 'desert_tile', bgTiles: [[42]] });
    expect(loads).toEqual([
      { key: 'desert_tile_042', url: 'assets/tilesets/TilesetDesert/tile_042.png' },
    ]);
  });

  it('returns nothing for levels without a background layer', () => {
    expect(collectBgTileLoads({})).toEqual([]);
    expect(collectBgTileLoads({ bgTiles: [[-1, -1]] })).toEqual([]);
  });
});
