import type { TowerData, TowerUpgradeData, EnemyData, WaveData, MapData, GameState } from '../types';

// --- Display ---
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;
export const BACKGROUND_COLOR = 0x1a1a2e;

// --- Dev Mode ---
export const DEV_MODE = true;

// --- Grid ---
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const CELL_SIZE = 48;

// --- Economy ---
export const STARTING_GOLD = 200;
export const SELL_REFUND_RATIO = 0.6;
export const WAVE_CLEAR_BONUS = 25;

// --- Starting Gold per Level ---
export const LEVEL_STARTING_GOLD: Record<number, number> = {
  0: 9999,   // Dev demo - unlimited
  1: 150,    // Winding Path - easy start
  2: 150,    // Zigzag Canyon
  3: 200,    // Crossroads
  4: 180,    // Spiral Fortress
  5: 200,    // Twin Peaks
  6: 200,    // The Maze
  7: 175,    // Spiral
  8: 200,    // Fork
  9: 225,    // Castle
  10: 150,   // Bridge - tight economy
  11: 175,   // Serpentine
  12: 200,   // Labyrinth
  13: 200,   // Dual
  14: 175,   // Zigzag II
  15: 250,   // Fortress
  16: 200,   // Gauntlet
  17: 225,   // Fortress II
  18: 200,   // Gauntlet II
  19: 250,   // Fortress III
  20: 200,   // Gauntlet III
  21: 225,   // Crossroads II
  22: 200,   // Gauntlet IV
  23: 250,   // Fortress IV
  24: 225,   // Gauntlet V
  25: 300,   // Final Boss
};

// --- Gameplay ---
export const STARTING_LIVES = 20;
export const WAVE_START_DELAY_MS = 15000;

// --- Colors ---
export const COLORS = {
  BACKGROUND: 0x1a1a2e,
  PATH: 0x3a3a5c,
  EMPTY: 0x2a2a4e,
  HOVER_VALID: 0x4CAF50,
  HOVER_INVALID: 0xe74c3c,
  GRID_LINE: 0x444466,
  TOWER_RANGE: 0xffffff,
  HEALTH_GREEN: 0x4CAF50,
  HEALTH_RED: 0xe74c3c,
  TEXT: 0xffffff,
  UI_BG: 0x222244,
  UI_BORDER: 0x555577,
  GOLD: 0xFFD700,
  LIFE: 0xff4444,
} as const;
