// ============================================================
// Server-saved levels: fetched from the API and parsed into
// playable maps at runtime (same shape the editor exports).
// ============================================================
import type { MapData } from '../types';
import { loadLevelFromJSON } from './LevelLoader';
import { api } from '../api/client';

const cache = new Map<number, MapData>();

/** Fetch a server level and parse it into a playable map (cached). */
export async function fetchServerLevel(id: number): Promise<MapData | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const record = await api.getLevel(id);
    const map = loadLevelFromJSON(record.data, id);
    cache.set(id, map);
    return map;
  } catch {
    return null;
  }
}

/** Already-fetched server level (PLAY AGAIN, offline), or null. */
export function cachedServerLevel(id: number): MapData | null {
  return cache.get(id) ?? null;
}
