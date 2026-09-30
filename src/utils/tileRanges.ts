// ============================================================
// Global background-tile IDs.
//
// Levels no longer declare a tileset — every background tile has a
// unique id across ALL tilesets. Ids are assigned in the canonical
// range order below; the editor palette tabs paint these global ids
// and the game maps them back to the right asset folder.
//
// Keep the counts in sync with public/assets/tilesets/<Folder>/*.png
// (tests/utils/backgroundTiles.test.ts verifies this against disk).
// ============================================================

export interface TilesetRange {
  /** Folder under public/assets/tilesets/ and editor/assets/ */
  folder: string;
  /** First global id of this tileset */
  base: number;
  /** Number of tiles (tile_000 .. tile_{count-1}) */
  count: number;
}

/** Canonical order — matches the editor palette tabs. */
export const TILESET_RANGES: TilesetRange[] = [
  { folder: 'TilesetNature', base: 0, count: 504 },
  { folder: 'TilesetField', base: 504, count: 75 },
  { folder: 'TilesetDesert', base: 579, count: 240 },
  { folder: 'TilesetFloor', base: 819, count: 594 },
  { folder: 'TilesetWater', base: 1413, count: 476 },
];

export const TOTAL_TILE_COUNT = TILESET_RANGES.reduce((n, r) => n + r.count, 0);

export interface TileInfo {
  globalId: number;
  folder: string;
  localId: number;
  /** Texture key used by the game */
  key: string;
  /** URL relative to the page root */
  url: string;
}

/** Resolve a global tile id to its folder, local id, texture key and URL. */
export function tileInfo(globalId: number): TileInfo | null {
  if (!Number.isInteger(globalId) || globalId < 0) return null;
  const range = TILESET_RANGES.find((r) => globalId >= r.base && globalId < r.base + r.count);
  if (!range) return null;
  const localId = globalId - range.base;
  const n = localId.toString().padStart(3, '0');
  return {
    globalId,
    folder: range.folder,
    localId,
    key: `bg_${globalId}`,
    url: `assets/tilesets/${range.folder}/tile_${n}.png`,
  };
}

/** Folder + local id -> global id (used for legacy level conversion). */
export function globalIdFor(folder: string, localId: number): number | null {
  const range = TILESET_RANGES.find((r) => r.folder === folder);
  if (!range || !Number.isInteger(localId) || localId < 0 || localId >= range.count) return null;
  return range.base + localId;
}

/**
 * Legacy level `tileset` value -> asset folder.
 * Old levels used texture prefixes ('nature_tile') or folder names
 * ('TilesetNature'); unknown values return null (not a legacy level).
 */
export function folderForTilesetName(name?: string): string | null {
  switch (name) {
    case 'TilesetNature':
    case 'nature_tile':
      return 'TilesetNature';
    case 'TilesetDesert':
    case 'desert_tile':
      return 'TilesetDesert';
    case 'TilesetField':
    case 'field_tile':
      return 'TilesetField';
    case 'TilesetFloor':
    case 'floor_tile':
      return 'TilesetFloor';
    case 'TilesetWater':
    case 'water_tile':
      return 'TilesetWater';
    default:
      return null;
  }
}
