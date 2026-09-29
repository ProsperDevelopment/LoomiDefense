// ============================================================
// On-demand background tile loading.
//
// Background tiles (504 nature / 239 desert / ...) are NOT loaded at
// boot — only the tiles a level actually uses are fetched when the
// level starts (see GameScene.drawBackgroundTiles).
// ============================================================

export interface TilesetAssets {
  /** Texture key prefix, e.g. 'nature_tile' → nature_tile_042 */
  prefix: string;
  /** Folder under public/assets/tilesets/, e.g. 'TilesetNature' */
  folder: string;
}

/**
 * Map a level's `tileset` value to the texture prefix + asset folder.
 * Older levels use texture prefixes ('nature_tile'), the editor exports
 * folder names ('TilesetNature') — both resolve to the same assets.
 * Unknown tilesets fall back to nature.
 */
export function resolveTilesetAssets(tileset?: string): TilesetAssets {
  switch (tileset) {
    case 'nature_tile':
    case 'TilesetNature':
      return { prefix: 'nature_tile', folder: 'TilesetNature' };
    case 'desert_tile':
    case 'TilesetDesert':
      return { prefix: 'desert_tile', folder: 'TilesetDesert' };
    case 'TilesetField':
      return { prefix: 'field_tile', folder: 'TilesetField' };
    case 'TilesetFloor':
      return { prefix: 'floor_tile', folder: 'TilesetFloor' };
    case 'TilesetWater':
      return { prefix: 'water_tile', folder: 'TilesetWater' };
    default:
      return { prefix: 'nature_tile', folder: 'TilesetNature' };
  }
}

/**
 * All unique texture loads a level's background layer needs.
 * Empty cells (-1) are skipped.
 */
export function collectBgTileLoads(mapData: {
  bgTiles?: number[][];
  tileset?: string;
}): Array<{ key: string; url: string }> {
  const { prefix, folder } = resolveTilesetAssets(mapData.tileset);
  const seen = new Set<string>();
  const loads: Array<{ key: string; url: string }> = [];

  for (const row of mapData.bgTiles ?? []) {
    for (const raw of row) {
      if (!Number.isFinite(raw)) continue;
      const idx = Math.floor(raw as number);
      if (idx < 0) continue;
      const n = idx.toString().padStart(3, '0');
      const key = `${prefix}_${n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      loads.push({ key, url: `assets/tilesets/${folder}/tile_${n}.png` });
    }
  }
  return loads;
}
