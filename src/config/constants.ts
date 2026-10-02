import type { TowerData, TowerUpgradeData, EnemyData, WaveData, MapData, GameState, Difficulty } from '../types';

// --- Display ---
export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 768;
export const BACKGROUND_COLOR = 0x1a1a2e;

// --- Dev Mode ---
export const DEV_MODE = true;
/** Coins dev accounts carry — seeded at register/login on the server. */
export const DEV_COINS = 9000;

// --- Grid ---
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const CELL_SIZE = 48;
export const GRID_OFFSET_Y = 48; // Height of top HUD bar

// --- Economy ---
export const STARTING_GOLD = 500;
export const SELL_REFUND_RATIO = 0.6;
export const WAVE_CLEAR_BONUS = 25;

// --- Meta economy (store coins) ---
export const COINS_PER_LEVEL_WIN = 50;

// --- Difficulty: starting lives per difficulty tier ---
export const DIFFICULTY_LIVES: Record<Difficulty, number> = {
  easy: 20,
  medium: 5,
  hard: 1,
};

/** Starting lives for a level's difficulty (defaults to easy). */
export function livesForDifficulty(difficulty?: Difficulty): number {
  return DIFFICULTY_LIVES[difficulty ?? 'easy'];
}

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
