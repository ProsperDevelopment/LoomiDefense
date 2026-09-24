// ============================================================
// Shared TypeScript Types for Tower Defense
// ============================================================

// --- Grid & Map ---
export type CellType = 'empty' | 'path' | 'tower' | 'blocked' | 'spawn' | 'base';
export type RoadDirection = 'horizontal' | 'vertical' | 'curve_tl' | 'curve_tr' | 'curve_bl' | 'curve_br' | 'cross' | 't_up' | 't_down' | 't_left' | 't_right';

export interface MapData {
  id: number;
  name: string;
  description: string;
  width: number;
  height: number;
  cellSize: number;
  grid: CellType[][];
  spawnPoints: { x: number; y: number }[];
  basePath: { x: number; y: number }[];
  bgTiles?: number[][];  // Background tiles (2x resolution, tile indices)
  tileset?: string;      // Tileset name to use
}

// --- Towers ---
export type TowerType = 'arrow' | 'cannon' | 'frost';
export type TargetMode = 'first' | 'closest' | 'strongest';

export interface TowerData {
  type: TowerType;
  name: string;
  cost: number;
  damage: number;
  fireRate: number;       // shots per second
  range: number;          // in pixels
  splashRadius: number;   // 0 = no splash
  slowFactor: number;     // 1.0 = no slow, 0.0 = full stop
  slowDuration: number;   // ms
  color: string;
  description: string;
}

export interface TowerUpgradeData {
  level: number;
  costMultiplier: number;
  damageMultiplier: number;
  rangeMultiplier: number;
  fireRateMultiplier: number;
}

// --- Enemies ---
export type EnemyType = 'basic' | 'fast' | 'armored' | 'healer' | 'swarm' | 'tank' | 'elite' | 'boss';

export interface EnemyData {
  type: EnemyType;
  name: string;
  hp: number;
  speed: number;
  armor: number;
  reward: number;
  color: string;
  size: number;
  immuneTo?: TowerType[];
}

// --- Waves ---
export interface WaveEntry {
  enemyType: EnemyType;
  count: number;
  spawnDelay: number;     // ms between spawns
  waveDelay: number;      // ms before this entry starts (from wave start)
}

export interface WaveData {
  waveNumber: number;
  entries: WaveEntry[];
}

// --- Game State ---
export interface GameState {
  gold: number;
  lives: number;
  score: number;
  wave: number;
  isPaused: boolean;
  isGameOver: boolean;
  isVictory: boolean;
}

// --- Events ---
export type GameEvent =
  | 'enemy-killed'
  | 'enemy-reached-base'
  | 'tower-placed'
  | 'tower-sold'
  | 'tower-upgraded'
  | 'wave-started'
  | 'wave-cleared'
  | 'all-waves-cleared'
  | 'gold-changed'
  | 'lives-changed'
  | 'game-over'
  | 'victory'
  | 'projectile-fired'
  | 'enemy-spawned';

export interface EventPayload {
  'enemy-killed': { enemyType: EnemyType; reward: number; x: number; y: number };
  'enemy-reached-base': { damage: number };
  'tower-placed': { towerType: TowerType; x: number; y: number };
  'tower-sold': { towerType: TowerType; refund: number };
  'tower-upgraded': { towerType: TowerType; newLevel: number };
  'wave-started': { waveNumber: number };
  'wave-cleared': { waveNumber: number };
  'all-waves-cleared': Record<string, never>;
  'gold-changed': { amount: number; total: number };
  'lives-changed': { amount: number; total: number };
  'game-over': Record<string, never>;
  'victory': Record<string, never>;
  'projectile-fired': { towerType: TowerType; x: number; y: number };
  'enemy-spawned': { enemyType: EnemyType; waveNumber: number };
}

// --- Object Pooling ---
export interface PooledObject<T = any> {
  active: boolean;
  data: T;
}

// --- UI ---
export interface ButtonConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: number;
  onClick?: () => void;
}
