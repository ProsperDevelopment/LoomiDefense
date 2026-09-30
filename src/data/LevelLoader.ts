import type { MapData, CellType, Difficulty, WaveData, WaveEntry, FgAreaType } from '../types';
import { convertLegacyBgTiles } from '../utils/backgroundTiles';
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

/** Validate a start-gold value; unknown/invalid falls back to undefined (default 500). */
function parseStartGold(value: unknown): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined;
  const n = Math.floor(value);
  return n >= 0 ? n : undefined;
}

/**
 * Parse the foreground-marker layer (background-tile resolution).
 * Anything that isn't a proper 2D array of 'fg'/other values becomes undefined.
 */
function parseFgAreas(value: unknown): FgAreaType[][] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every((row) => Array.isArray(row))) return undefined;
  return value.map((row) => row.map((v) => (v === 'fg' ? 'fg' as const : 'none' as const)));
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
    // Legacy levels declared a tileset with local indices — convert to
    // global tile ids; newer levels are already global.
    bgTiles: convertLegacyBgTiles(jsonData.bgTiles, jsonData.tileset),
    areas: Array.isArray(jsonData.areas) ? jsonData.areas : undefined,
    fgAreas: parseFgAreas(jsonData.fgAreas),
    difficulty: parseDifficulty(jsonData.difficulty),
    startGold: parseStartGold(jsonData.startGold),
    waves: parseWaves(jsonData.waves),
    // Legacy exports used `grassColor` — fall back so old files keep their colors
    groundColor: parseColor(jsonData.groundColor ?? jsonData.grassColor),
    groundColorDark: parseColor(jsonData.groundColorDark ?? jsonData.grassColorDark),
    roadColor: parseColor(jsonData.roadColor),
    roadColorDark: parseColor(jsonData.roadColorDark),
  };
}

// Import level JSON files

import level0Data from './levels/level0.json';

export const LEVEL_0 = loadLevelFromJSON(level0Data, 0);

import level1Data from './levels/level1.json';

export const LEVEL_1 = loadLevelFromJSON(level1Data, 1);

import level2Data from './levels/level2.json';

export const LEVEL_2 = loadLevelFromJSON(level2Data, 2);

import level3Data from './levels/level3.json';

export const LEVEL_3 = loadLevelFromJSON(level3Data, 3);

import level4Data from './levels/level4.json';

export const LEVEL_4 = loadLevelFromJSON(level4Data, 4);

import level5Data from './levels/level5.json';

export const LEVEL_5 = loadLevelFromJSON(level5Data, 5);

import level6Data from './levels/level6.json';

export const LEVEL_6 = loadLevelFromJSON(level6Data, 6);

import level7Data from './levels/level7.json';

export const LEVEL_7 = loadLevelFromJSON(level7Data, 7);

import level8Data from './levels/level8.json';

export const LEVEL_8 = loadLevelFromJSON(level8Data, 8);

import level9Data from './levels/level9.json';

export const LEVEL_9 = loadLevelFromJSON(level9Data, 9);

import level10Data from './levels/level10.json';

export const LEVEL_10 = loadLevelFromJSON(level10Data, 10);

import level11Data from './levels/level11.json';

export const LEVEL_11 = loadLevelFromJSON(level11Data, 11);

import level12Data from './levels/level12.json';

export const LEVEL_12 = loadLevelFromJSON(level12Data, 12);

import level13Data from './levels/level13.json';

export const LEVEL_13 = loadLevelFromJSON(level13Data, 13);

import level14Data from './levels/level14.json';

export const LEVEL_14 = loadLevelFromJSON(level14Data, 14);

import level15Data from './levels/level15.json';

export const LEVEL_15 = loadLevelFromJSON(level15Data, 15);

import level16Data from './levels/level16.json';

export const LEVEL_16 = loadLevelFromJSON(level16Data, 16);

import level17Data from './levels/level17.json';

export const LEVEL_17 = loadLevelFromJSON(level17Data, 17);

import level18Data from './levels/level18.json';

export const LEVEL_18 = loadLevelFromJSON(level18Data, 18);

import level19Data from './levels/level19.json';

export const LEVEL_19 = loadLevelFromJSON(level19Data, 19);

import level20Data from './levels/level20.json';

export const LEVEL_20 = loadLevelFromJSON(level20Data, 20);

import level21Data from './levels/level21.json';

export const LEVEL_21 = loadLevelFromJSON(level21Data, 21);

import level22Data from './levels/level22.json';

export const LEVEL_22 = loadLevelFromJSON(level22Data, 22);

import level23Data from './levels/level23.json';

export const LEVEL_23 = loadLevelFromJSON(level23Data, 23);

import level24Data from './levels/level24.json';

export const LEVEL_24 = loadLevelFromJSON(level24Data, 24);

import level25Data from './levels/level25.json';

export const LEVEL_25 = loadLevelFromJSON(level25Data, 25);
