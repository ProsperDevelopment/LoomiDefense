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
const DB_PATH = join(DATA_DIR, 'db.json');

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

interface Database {
  users: UserRecord[];
  sessions: Record<string, string>; // token -> userId
}

function loadDb(): Database {
  if (!existsSync(DB_PATH)) {
    return { users: [], sessions: {} };
  }
  try {
    const raw = readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw) as Database;
  } catch {
    return { users: [], sessions: {} };
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

  /** Test helper: reset the in-memory DB (does not touch disk unless persisted). */
  _reset(): void {
    db = { users: [], sessions: {} };
  },
};
