// ============================================================
// JSON file backed data store.
// ============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { PublicUser, UserSettings, UserProgress } from '../shared/protocol';
import { DEFAULT_SETTINGS, defaultProgress } from '../shared/protocol';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
// Test runs must never touch the real database: without this, the
// per-test _reset() + a test registration would persist a wiped state
// and erase every registered dev user.
const DB_PATH = process.env.VITEST
  ? join(DATA_DIR, 'db.test.json')
  : join(DATA_DIR, 'db.json');

export interface UserRecord {
  id: string;
  username: string; // lowercase, unique
  displayName: string;
  passwordHash: string;
  salt: string;
  settings: UserSettings;
  progress: UserProgress;
  friends: string[]; // user ids
  createdAt: number;
}

/** A level saved from the editor to the game server. */
export interface LevelRecord {
  id: number;
  ownerId: string;
  ownerName: string;
  name: string;
  description: string;
  difficulty: string;
  /** Full editor-format level JSON (parsed by loadLevelFromJSON). */
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

interface Database {
  users: UserRecord[];
  sessions: Record<string, string>; // token -> userId
  levels?: LevelRecord[]; // optional so old db.json files still load
}

function loadDb(): Database {
  if (!existsSync(DB_PATH)) {
    return { users: [], sessions: {}, levels: [] };
  }
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    parsed.levels = parsed.levels ?? [];
    return parsed;
  } catch {
    return { users: [], sessions: {}, levels: [] };
  }
}

let db: Database = loadDb();

function persist(): void {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    settings: { ...u.settings },
    progress: {
      unlocked: [...u.progress.unlocked],
      completed: [...u.progress.completed],
      coins: u.progress.coins,
      ownedTowers: [...u.progress.ownedTowers],
      loadout: [...u.progress.loadout],
    },
    friends: [...u.friends],
    createdAt: u.createdAt,
  };
}

/** Denormalized difficulty for level listings (unknown -> easy). */
function difficultyOf(data: unknown): string {
  const d = (data as { difficulty?: unknown } | null)?.difficulty;
  return typeof d === 'string' ? d : 'easy';
}

export const store = {
  findUserByUsername(username: string): UserRecord | undefined {
    return db.users.find((u) => u.username === username.toLowerCase());
  },

  findUserById(id: string): UserRecord | undefined {
    return db.users.find((u) => u.id === id);
  },

  createUser(username: string, passwordHash: string, salt: string): UserRecord {
    const user: UserRecord = {
      id: randomUUID(),
      username: username.toLowerCase(),
      displayName: username,
      passwordHash,
      salt,
      settings: { ...DEFAULT_SETTINGS },
      progress: defaultProgress(),
      friends: [],
      createdAt: Date.now(),
    };
    db.users.push(user);
    persist();
    return user;
  },

  saveSession(token: string, userId: string): void {
    db.sessions[token] = userId;
    persist();
  },

  findUserIdByToken(token: string): string | undefined {
    return db.sessions[token];
  },

  revokeSession(token: string): void {
    delete db.sessions[token];
    persist();
  },

  updateUser(user: UserRecord): void {
    persist();
  },

  searchUsers(query: string, excludeId: string): UserRecord[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return db.users
      .filter(
        (u) =>
          u.id !== excludeId &&
          (u.username.includes(q) || u.displayName.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  },

  addFriend(user: UserRecord, friendId: string): boolean {
    if (user.id === friendId || user.friends.includes(friendId)) return false;
    user.friends.push(friendId);
    persist();
    return true;
  },

  removeFriend(user: UserRecord, friendId: string): boolean {
    const idx = user.friends.indexOf(friendId);
    if (idx < 0) return false;
    user.friends.splice(idx, 1);
    persist();
    return true;
  },

  // --- Server-saved levels ---

  /** Newest first; summaries only (no level payload). */
  listLevels(): Array<Omit<LevelRecord, 'data'>> {
    return [...(db.levels ?? [])]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ data: _data, ...summary }) => summary);
  },

  getLevel(id: number): LevelRecord | undefined {
    return (db.levels ?? []).find((l) => l.id === id);
  },

  createLevel(input: {
    ownerId: string;
    ownerName: string;
    name: string;
    description: string;
    data: unknown;
  }): LevelRecord {
    const levels = (db.levels ??= []);
    const nextId = levels.reduce((max, l) => Math.max(max, l.id), 1_000_000) + 1;
    const now = Date.now();
    const difficulty = difficultyOf(input.data);
    const level: LevelRecord = {
      id: nextId,
      ownerId: input.ownerId,
      ownerName: input.ownerName,
      name: input.name,
      description: input.description,
      difficulty,
      data: input.data,
      createdAt: now,
      updatedAt: now,
    };
    levels.push(level);
    persist();
    return level;
  },

  updateLevel(
    id: number,
    ownerId: string,
    patch: { name: string; description: string; data: unknown },
  ): LevelRecord | undefined {
    const level = this.getLevel(id);
    if (!level || level.ownerId !== ownerId) return undefined;
    level.name = patch.name;
    level.description = patch.description;
    level.data = patch.data;
    level.difficulty = difficultyOf(patch.data);
    level.updatedAt = Date.now();
    persist();
    return level;
  },

  deleteLevel(id: number, ownerId: string): boolean {
    const levels = db.levels ?? [];
    const idx = levels.findIndex((l) => l.id === id && l.ownerId === ownerId);
    if (idx < 0) return false;
    levels.splice(idx, 1);
    persist();
    return true;
  },

  /** Test helper: reset the in-memory DB (does not touch disk unless persisted). */
  _reset(): void {
    db = { users: [], sessions: {}, levels: [] };
  },
};
