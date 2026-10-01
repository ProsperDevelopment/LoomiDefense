// ============================================================
// REST API tests: auth, profile/settings, progress, friends,
// user search, and store.
// ============================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { app } from '../../server/api';
import { store } from '../../server/db';
import type { UserProgress } from '../../shared/protocol';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  store._reset();
});

async function req(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function registerUser(username = 'testuser', password = 'secret123') {
  const res = await req('POST', '/api/auth/register', { username, password });
  expect(res.status).toBe(201);
  return res.json as { token: string; user: { id: string; username: string; progress: UserProgress } };
}

describe('auth', () => {
  it('registers a new user with default progress', async () => {
    const { token, user } = await registerUser('alice');
    expect(token).toBeTruthy();
    expect(user.username).toBe('alice');
    expect(user.progress.ownedTowers).toEqual(['arrow', 'cannon', 'frost']);
    expect(user.progress.loadout).toEqual(['arrow', 'cannon', 'frost']);
    expect(user.progress.unlocked).toEqual([1]);
    expect(user.progress.coins).toBe(0);
  });

  it('rejects duplicate usernames', async () => {
    await registerUser('bob');
    const res = await req('POST', '/api/auth/register', { username: 'bob', password: 'secret123' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid usernames and short passwords', async () => {
    expect((await req('POST', '/api/auth/register', { username: 'ab', password: 'secret123' })).status).toBe(400);
    expect((await req('POST', '/api/auth/register', { username: 'ok_name', password: '123' })).status).toBe(400);
  });

  it('logs in with correct password and rejects wrong one', async () => {
    await registerUser('carol', 'hunter22');
    const ok = await req('POST', '/api/auth/login', { username: 'carol', password: 'hunter22' });
    expect(ok.status).toBe(200);
    expect(ok.json.token).toBeTruthy();

    const bad = await req('POST', '/api/auth/login', { username: 'carol', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('rejects requests without a token', async () => {
    const res = await req('GET', '/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects requests with an invalid token', async () => {
    const res = await req('GET', '/api/me', undefined, 'not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('profile and settings', () => {
  it('updates display name and tower color', async () => {
    const { token } = await registerUser('dave');
    const res = await req('PATCH', '/api/me', {
      displayName: 'DaveTheGreat',
      settings: { towerColor: '#ff8800' },
    }, token);
    expect(res.status).toBe(200);
    expect(res.json.user.displayName).toBe('DaveTheGreat');
    expect(res.json.user.settings.towerColor).toBe('#ff8800');
  });

  it('rejects invalid tower color', async () => {
    const { token } = await registerUser('erin');
    const res = await req('PATCH', '/api/me', { settings: { towerColor: 'red' } }, token);
    // Invalid color is ignored, not applied
    expect(res.json.user.settings.towerColor).toBe('#4CAF50');
  });
});

describe('user search', () => {
  it('finds users by username prefix', async () => {
    await registerUser('frank');
    const { token } = await registerUser('grace');
    const res = await req('GET', '/api/users/search?q=fra', undefined, token);
    expect(res.status).toBe(200);
    expect(res.json.users).toHaveLength(1);
    expect(res.json.users[0].username).toBe('frank');
  });

  it('never returns the searching user', async () => {
    const { token } = await registerUser('heidi');
    const res = await req('GET', '/api/users/search?q=heid', undefined, token);
    expect(res.json.users).toHaveLength(0);
  });
});

describe('friends', () => {
  it('adds and removes friends', async () => {
    await registerUser('ivan');
    const { token } = await registerUser('judy');

    const add = await req('POST', '/api/friends', { username: 'ivan' }, token);
    expect(add.status).toBe(200);
    expect(add.json.friends).toHaveLength(1);
    expect(add.json.friends[0].username).toBe('ivan');

    const list = await req('GET', '/api/friends', undefined, token);
    expect(list.json.friends).toHaveLength(1);

    const del = await req('DELETE', '/api/friends/ivan', undefined, token);
    expect(del.status).toBe(200);
    expect(del.json.friends).toHaveLength(0);
  });

  it('404s for unknown users and 400s for self-add', async () => {
    const { token } = await registerUser('karen');
    expect((await req('POST', '/api/friends', { username: 'ghost' }, token)).status).toBe(404);
    expect((await req('POST', '/api/friends', { username: 'karen' }, token)).status).toBe(400);
  });
});

describe('progress', () => {
  it('awards coins only on first level completion', async () => {
    const { token } = await registerUser('leo');

    const first = await req('POST', '/api/progress/complete-level', { levelId: 1, coins: 50 }, token);
    expect(first.json.firstTime).toBe(true);
    expect(first.json.progress.coins).toBe(50);
    expect(first.json.progress.completed).toContain(1);
    expect(first.json.progress.unlocked.length).toBeGreaterThan(1);

    const second = await req('POST', '/api/progress/complete-level', { levelId: 1, coins: 50 }, token);
    expect(second.json.firstTime).toBe(false);
    expect(second.json.progress.coins).toBe(50);
  });

  it('saves and returns progress', async () => {
    const { token } = await registerUser('mia');
    const res = await req('PUT', '/api/progress', {
      progress: { unlocked: [1, 2, 3], completed: [1], coins: 120 },
    }, token);
    expect(res.status).toBe(200);
    expect(res.json.progress.coins).toBe(120);
    expect(res.json.progress.unlocked).toEqual([1, 2, 3]);

    const got = await req('GET', '/api/progress', undefined, token);
    expect(got.json.progress.coins).toBe(120);
  });
});

describe('store', () => {
  it('lists catalog with owned state', async () => {
    const { token } = await registerUser('nina');
    const res = await req('GET', '/api/store', undefined, token);
    expect(res.status).toBe(200);
    expect(res.json.catalog.map((c: { towerType: string }) => c.towerType)).toEqual(['sniper', 'mortar', 'tesla', 'grenade']);
    expect(res.json.ownedTowers).toEqual(['arrow', 'cannon', 'frost']);
  });

  it('buys a tower when coins suffice', async () => {
    const { token } = await registerUser('oscar');
    await req('PUT', '/api/progress', { progress: { coins: 500 } }, token);

    const res = await req('POST', '/api/store/buy', { towerType: 'sniper' }, token);
    expect(res.status).toBe(200);
    expect(res.json.coins).toBe(350);
    expect(res.json.ownedTowers).toContain('sniper');

    const again = await req('POST', '/api/store/buy', { towerType: 'sniper' }, token);
    expect(again.status).toBe(409);
  });

  it('rejects purchase without enough coins', async () => {
    const { token } = await registerUser('peggy');
    const res = await req('POST', '/api/store/buy', { towerType: 'tesla' }, token);
    expect(res.status).toBe(402);
  });

  it('rejects unknown items', async () => {
    const { token } = await registerUser('quentin');
    const res = await req('POST', '/api/store/buy', { towerType: 'nuke' }, token);
    expect(res.status).toBe(404);
  });
});
