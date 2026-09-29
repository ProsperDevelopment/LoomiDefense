import type { MapData, CellType, Difficulty, WaveData, WaveEntry } from '../types';
import { ENEMY_DEFINITIONS } from './enemies';

/**
 * Parse a level color value. Accepts a number (0xRRGGBB) or a hex
 * string like "#a1b2c3". Returns undefined when not set.
 */
function parseColor(value: unknown): number | undefined {
  if (typeof value === 'number' && isFinite(value)) return value >>> 0;
  if (typeof value === 'string') {
    const hex = value.startsWith('#') ? value.slice(1) : value;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  }
  return undefined;
}

/** Validate a difficulty value; anything unknown falls back to undefined (easy). */
function parseDifficulty(value: unknown): Difficulty | undefined {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : undefined;
}

/**
 * Parse level-defined wave definitions. Malformed entries are dropped,
 * wave numbers are re-assigned by position. Returns undefined when the
 * level has no usable custom waves (the game then uses its defaults).
 */
function parseWaves(value: unknown): WaveData[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const waves: WaveData[] = [];
  for (const raw of value) {
    if (!raw || !Array.isArray(raw.entries)) continue;
    const entries: WaveEntry[] = [];
    for (const e of raw.entries) {
      if (!e || typeof e.enemyType !== 'string') continue;
      if (!(e.enemyType in ENEMY_DEFINITIONS)) continue;
      const count = Math.floor(Number(e.count));
      if (!Number.isFinite(count) || count < 1) continue;
      entries.push({
        enemyType: e.enemyType as WaveEntry['enemyType'],
        count,
        spawnDelay: Math.max(0, Math.floor(Number(e.spawnDelay) || 0)),
        waveDelay: Math.max(0, Math.floor(Number(e.waveDelay) || 0)),
      });
    }
    if (entries.length === 0) continue;
    waves.push({ waveNumber: waves.length + 1, entries });
  }
  return waves.length > 0 ? waves : undefined;
}

/**
 * Load a level from JSON file data
 */
export function loadLevelFromJSON(jsonData: any, id: number): MapData {
  const grid: CellType[][] = [];
  
  // Create grid from path points
  for (let y = 0; y < jsonData.height; y++) {
    const row: CellType[] = [];
    for (let x = 0; x < jsonData.width; x++) {
      // Check if this is a spawn point
      const isSpawn = jsonData.spawnPoints?.some((s: any) => s.x === x && s.y === y);
      // Check if this is a base point
      const isBase = jsonData.basePoints?.some((b: any) => b.x === x && b.y === y);
      // Check if this is a path point
      const isPath = jsonData.path?.some((p: any) => p.x === x && p.y === y);
      
      if (isSpawn) {
        row.push('spawn');
      } else if (isBase) {
        row.push('base');
      } else if (isPath) {
        row.push('path');
      } else {
        row.push('empty');
      }
    }
    grid.push(row);
  }

  // Build basePath from path points
  const basePath = (jsonData.path || []).map((p: any) => ({ x: p.x, y: p.y }));
  const spawnPoints = jsonData.spawnPoints || [];
  
  return {
    id: id,
    name: jsonData.name || 'Untitled',
    description: jsonData.description || '',
    width: jsonData.width,
    height: jsonData.height,
    cellSize: 48,
    grid,
    spawnPoints,
    basePath,
    bgTiles: jsonData.bgTiles,
    tileset: jsonData.tileset,
    areas: Array.isArray(jsonData.areas) ? jsonData.areas : undefined,
    difficulty: parseDifficulty(jsonData.difficulty),
    waves: parseWaves(jsonData.waves),
    grassColor: parseColor(jsonData.grassColor),
    grassColorDark: parseColor(jsonData.grassColorDark),
    roadColor: parseColor(jsonData.roadColor),
    roadColorDark: parseColor(jsonData.roadColorDark),
  };
}

// Import level JSON files
import level3Data from './levels/level3.json';

export const LEVEL_3 = loadLevelFromJSON(level3Data, 3);

import level4Data from './levels/level4.json';


export const LEVEL_4 = loadLevelFromJSON(level4Data, 4);

import level5Data from './levels/level5.json';

export const LEVEL_5 = loadLevelFromJSON(level5Data, 5);

import level8Data from './levels/level8.json';

export const LEVEL_8 = loadLevelFromJSON(level8Data, 8);


import level9Data from './levels/level9.json';

export const LEVEL_9 = loadLevelFromJSON(level9Data, 9);