// ============================================================
// Shared protocol between client and server.
// Used by both the Vite client (src/) and the Node server (server/).
// ============================================================

// --- REST DTOs ---

export interface UserSettings {
  towerColor: string; // '#rrggbb'
}

export interface UserProgress {
  unlocked: number[];
  completed: number[];
  coins: number;
  ownedTowers: string[];
  loadout: string[];
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  settings: UserSettings;
  progress: UserProgress;
  friends: string[]; // user ids
  createdAt: number;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
}

export interface StoreCatalogItem {
  towerType: string;
  price: number;
  name: string;
  description: string;
}

export const DEFAULT_SETTINGS: UserSettings = { towerColor: '#4CAF50' };

export function defaultProgress(): UserProgress {
  return {
    unlocked: [1],
    completed: [],
    coins: 0,
    ownedTowers: ['arrow', 'cannon', 'frost'],
    loadout: ['arrow', 'cannon', 'frost'],
  };
}

// --- Multiplayer lobby (WebSocket) ---

export interface RoomPlayer {
  id: string;
  username: string;
  displayName: string;
  color: string;
  ready: boolean;
  host: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  levelId: number;
  status: 'lobby' | 'started';
  players: RoomPlayer[];
}

export type ClientMessage =
  | { type: 'auth'; token: string; towerColor: string }
  | { type: 'host'; levelId: number }
  | { type: 'join'; code: string }
  | { type: 'leave' }
  | { type: 'chat'; text: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'set-level'; levelId: number }
  | { type: 'start' }
  | { type: 'net'; data: GameNetMessage };

export type ServerMessage =
  | { type: 'auth-ok'; userId: string; username: string }
  | { type: 'error'; message: string }
  | { type: 'room'; room: RoomState }
  | { type: 'start'; room: RoomState; loadout: string[]; levelId: number }
  | { type: 'chat'; from: string; text: string; ts: number }
  | { type: 'net'; from: string; data: GameNetMessage }
  | { type: 'left'; userId: string; username: string };

// --- In-game network messages (relayed by server) ---

export interface NetEnemySnap {
  id: string;
  type: string;
  x: number;
  y: number;
  hp: number;
  hpMax: number;
}

export interface NetTowerSnap {
  id: string;
  type: string;
  col: number;
  row: number;
  level: number;
  color: string;
  ownerId?: string;
}

export interface NetProjectileSnap {
  id: string;
  type: string;
  x: number;
  y: number;
}

export type NetStatus = 'playing' | 'won' | 'lost';

export interface NetSnapshot {
  kind: 'snap';
  status: NetStatus;
  gold: number;
  /** Per-player gold (each player has their own economy). */
  golds?: Record<string, number>;
  lives: number;
  wave: number;
  waveTotal: number;
  score: number;
  enemies: NetEnemySnap[];
  towers: NetTowerSnap[];
  projectiles?: NetProjectileSnap[];
}

export type NetCommand =
  | { k: 'place'; col: number; row: number; type: string }
  | { k: 'upgrade'; id: string }
  | { k: 'sell'; id: string }
  | { k: 'wave' }
  | { k: 'early' };

export interface NetCommandMsg {
  kind: 'cmd';
  cmd: NetCommand;
}

export type GameNetMessage = NetSnapshot | NetCommandMsg;
