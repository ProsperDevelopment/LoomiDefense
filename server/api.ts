// ============================================================
// REST API: auth, profile/settings, progress, friends, search, store.
// ============================================================
import express, { type Request, type Response, type NextFunction } from 'express';
import { store, toPublicUser, type UserRecord } from './db';
import { hashPassword, verifyPassword, createToken } from './auth';
import type { StoreCatalogItem, UserProgress } from '../shared/protocol';
import { DEV_MODE, DEV_COINS } from '../src/config/constants';

// Tower store catalog: tower types unlocked with coins (beyond the 3 free ones).
export const STORE_CATALOG: StoreCatalogItem[] = [
  { towerType: 'sniper', price: 150, name: 'Sniper Tower', description: 'Huge range, massive single-target damage' },
  { towerType: 'mortar', price: 250, name: 'Mortar Tower', description: 'Long range artillery with big splash' },
  { towerType: 'tesla', price: 400, name: 'Tesla Tower', description: 'Rapid fire chain lightning' },
  { towerType: 'grenade', price: 300, name: 'Grenade Tower', description: 'Lobs grenades that burst into shrapnel' },
];

export const FREE_TOWERS = ['arrow', 'cannon', 'frost'];

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

interface AuthedRequest extends Request {
  user?: UserRecord;
  token?: string;
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }
  const userId = store.findUserIdByToken(token);
  const user = userId ? store.findUserById(userId) : undefined;
  if (!user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// --- Auth ---

app.post('/api/auth/register', (req: AuthedRequest, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 chars (letters, numbers, _)' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }
  if (store.findUserByUsername(username)) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }
  const { hash, salt } = hashPassword(password);
  const user = store.createUser(username, hash, salt);
  // Dev mode: accounts start with spendable dev coins
  if (DEV_MODE) {
    user.progress.coins = DEV_COINS;
    store.updateUser(user);
  }
  const token = createToken();
  store.saveSession(token, user.id);
  res.status(201).json({ token, user: toPublicUser(user) });
});

app.post('/api/auth/login', (req: AuthedRequest, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'username and password required' });
    return;
  }
  const user = store.findUserByUsername(username);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  // Dev mode: top the account back up so dev coins stay spendable
  if (DEV_MODE && user.progress.coins < DEV_COINS) {
    user.progress.coins = DEV_COINS;
    store.updateUser(user);
  }
  const token = createToken();
  store.saveSession(token, user.id);
  res.json({ token, user: toPublicUser(user) });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res: Response) => {
  if (req.token) store.revokeSession(req.token);
  res.json({ ok: true });
});

// --- Profile / settings ---

app.get('/api/me', authMiddleware, (req: AuthedRequest, res: Response) => {
  res.json({ user: toPublicUser(req.user!) });
});

app.patch('/api/me', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const { displayName, settings } = req.body ?? {};

  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 24) {
      res.status(400).json({ error: 'Display name must be 1-24 characters' });
      return;
    }
    user.displayName = displayName.trim();
  }

  if (settings !== undefined) {
    if (typeof settings !== 'object' || settings === null) {
      res.status(400).json({ error: 'settings must be an object' });
      return;
    }
    if (typeof settings.towerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(settings.towerColor)) {
      user.settings.towerColor = settings.towerColor;
    }
  }

  store.updateUser(user);
  res.json({ user: toPublicUser(user) });
});

// --- Progress ---

app.get('/api/progress', authMiddleware, (req: AuthedRequest, res: Response) => {
  res.json({ progress: req.user!.progress });
});

app.put('/api/progress', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const incoming = req.body?.progress;
  if (typeof incoming !== 'object' || incoming === null) {
    res.status(400).json({ error: 'progress object required' });
    return;
  }
  const p: UserProgress = user.progress;

  if (Array.isArray(incoming.unlocked)) {
    const nums = incoming.unlocked.filter((n: unknown): n is number => Number.isInteger(n));
    p.unlocked = Array.from(new Set<number>(nums as number[]));
  }
  if (Array.isArray(incoming.completed)) {
    const nums = incoming.completed.filter((n: unknown): n is number => Number.isInteger(n));
    p.completed = Array.from(new Set<number>(nums as number[]));
  }
  if (typeof incoming.coins === 'number' && Number.isFinite(incoming.coins) && incoming.coins >= 0) {
    p.coins = Math.floor(incoming.coins);
  }
  if (Array.isArray(incoming.loadout)) {
    const valid = incoming.loadout.filter(
      (t: unknown): t is string => typeof t === 'string' && p.ownedTowers.includes(t),
    ) as string[];
    const unique = Array.from(new Set(valid));
    if (unique.length === 3) {
      p.loadout = unique;
    }
  }

  store.updateUser(user);
  res.json({ progress: p });
});

// Award coins for completing a level (idempotent per level via completed list).
app.post('/api/progress/complete-level', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const { levelId, coins } = req.body ?? {};
  if (!Number.isInteger(levelId) || levelId < 0) {
    res.status(400).json({ error: 'levelId required' });
    return;
  }
  const reward = Number.isInteger(coins) && coins > 0 ? Math.min(coins, 500) : 50;
  const firstTime = !user.progress.completed.includes(levelId);
  if (firstTime) {
    user.progress.completed.push(levelId);
    user.progress.coins += reward;
    for (const n of [levelId - 1, levelId + 1, 3, 4, 5]) {
      if (n >= 1 && n <= 25 && !user.progress.unlocked.includes(n)) {
        user.progress.unlocked.push(n);
      }
    }
  }
  store.updateUser(user);
  res.json({ progress: user.progress, firstTime, reward: firstTime ? reward : 0 });
});

// --- Friends ---

app.get('/api/friends', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const friends = user.friends
    .map((id) => store.findUserById(id))
    .filter((u): u is UserRecord => !!u)
    .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName }));
  res.json({ friends });
});

app.post('/api/friends', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const { username } = req.body ?? {};
  if (typeof username !== 'string') {
    res.status(400).json({ error: 'username required' });
    return;
  }
  const target = store.findUserByUsername(username);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.id === user.id) {
    res.status(400).json({ error: 'Cannot add yourself' });
    return;
  }
  store.addFriend(user, target.id);
  res.json({
    friends: user.friends.map((id) => {
      const u = store.findUserById(id);
      return u ? { id: u.id, username: u.username, displayName: u.displayName } : null;
    }).filter(Boolean),
  });
});

app.delete('/api/friends/:username', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const target = store.findUserByUsername(String(req.params.username));
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  store.removeFriend(user, target.id);
  res.json({
    friends: user.friends.map((id) => {
      const u = store.findUserById(id);
      return u ? { id: u.id, username: u.username, displayName: u.displayName } : null;
    }).filter(Boolean),
  });
});

// --- User search ---

app.get('/api/users/search', authMiddleware, (req: AuthedRequest, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const results = store.searchUsers(q, req.user!.id).map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
  }));
  res.json({ users: results });
});

// --- Store ---

app.get('/api/store', authMiddleware, (req: AuthedRequest, res: Response) => {
  res.json({
    catalog: STORE_CATALOG,
    coins: req.user!.progress.coins,
    ownedTowers: req.user!.progress.ownedTowers,
  });
});

app.post('/api/store/buy', authMiddleware, (req: AuthedRequest, res: Response) => {
  const user = req.user!;
  const { towerType } = req.body ?? {};
  const item = STORE_CATALOG.find((c) => c.towerType === towerType);
  if (!item) {
    res.status(404).json({ error: 'Unknown item' });
    return;
  }
  if (user.progress.ownedTowers.includes(towerType)) {
    res.status(409).json({ error: 'Already owned' });
    return;
  }
  if (user.progress.coins < item.price) {
    res.status(402).json({ error: 'Not enough coins' });
    return;
  }
  user.progress.coins -= item.price;
  user.progress.ownedTowers.push(towerType);
  store.updateUser(user);
  res.json({
    coins: user.progress.coins,
    ownedTowers: user.progress.ownedTowers,
    catalog: STORE_CATALOG,
  });
});

// JSON error handler: any unexpected throw becomes a JSON error, never a stack
// trace. Respects status set by the error (e.g. body-parser's 400s).
// Express identifies error middleware by its 4-arg signature.
app.use((err: { status?: number; message?: string } | unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;
  if (status >= 500) {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }
  const message =
    typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : 'Bad request';
  res.status(status).json({ error: message });
});

export { app };
