// ============================================================
// On-demand background tile loading.
//
// Background tiles are NOT loaded at boot — only the tiles a level
// actually uses are fetched when the level starts (see
// GameScene.drawBackgroundTiles). Tile ids are global across all
// tilesets (see tileRanges.ts).
// ============================================================
import { tileInfo, folderForTilesetName, globalIdFor } from './tileRanges';

/**
 * All unique texture loads a level's background layer needs.
 * Empty cells (-1) and unknown ids are skipped.
 */
export function collectBgTileLoads(bgTiles?: number[][]): Array<{ key: string; url: string }> {
  const seen = new Set<number>();
  const loads: Array<{ key: string; url: string }> = [];

  for (const row of bgTiles ?? []) {
    for (const raw of row) {
      if (!Number.isFinite(raw)) continue;
      const info = tileInfo(Math.floor(raw as number));
      if (!info || seen.has(info.globalId)) continue;
      seen.add(info.globalId);
      loads.push({ key: info.key, url: info.url });
    }
  }
  return loads;
}

/** Texture key of a global tile id ('' when the id is unknown). */
export function bgTileKey(globalId: number): string {
  return tileInfo(globalId)?.key ?? '';
}

/**
 * Convert a legacy level's background layer (local indices into a single
 * declared `tileset`) to global tile ids. Levels without a `tileset`
 * already use global ids and are passed through unchanged.
 * Returns undefined when the layer is missing or malformed.
 */
export function convertLegacyBgTiles(
  bgTiles: unknown,
  tileset?: string,
): number[][] | undefined {
  if (!Array.isArray(bgTiles) || bgTiles.length === 0) return undefined;
  if (!bgTiles.every((row) => Array.isArray(row))) return undefined;

  const folder = folderForTilesetName(tileset);
  if (folder === null) {
    // No legacy tileset declaration: ids are already global
    return bgTiles.map((row) =>
      row.map((v) => {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n >= 0 ? n : -1;
      }),
    );
  }

  return bgTiles.map((row) =>
    row.map((v) => {
      const local = Math.floor(Number(v));
      if (!Number.isFinite(local) || local < 0) return -1;
      const global = globalIdFor(folder, local);
      return global !== null ? global : -1;
    }),
  );
}
