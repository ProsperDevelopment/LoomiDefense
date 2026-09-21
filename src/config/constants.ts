import type { TowerData, TowerUpgradeData, EnemyData, WaveData, MapData, GameState } from '../types';

// --- Display ---
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;
export const BACKGROUND_COLOR = 0x1a1a2e;

// --- Grid ---
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const CELL_SIZE = 48;

// --- Economy ---
export const STARTING_GOLD = 100;
export const SELL_REFUND_RATIO = 0.6;
export const WAVE_CLEAR_BONUS = 25;

// --- Gameplay ---
export const STARTING_LIVES = 20;
export const WAVE_START_DELAY_MS = 3000;

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
