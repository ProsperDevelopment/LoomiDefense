// ============================================================
// WebSocket lobby tests: auth, host/join, chat, ready, start,
// and in-game message relay.
// ============================================================
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { app } from '../../server/api';
import { attachLobbyServer } from '../../server/lobby';
import { store } from '../../server/db';
import type { ServerMessage, ClientMessage } from '../../shared/protocol';

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(app);
  attachLobbyServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}, 15000);

beforeEach(() => {
  store._reset();
});

class TestClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  private waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];

  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (w.predicate(msg)) {
          w.resolve(msg);
          return false;
        }
        return true;
      });
    });
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Wait for a message matching the predicate (searches already-received too). */
  wait(predicate: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
      this.waiters.push({
        predicate,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  async authenticate(username: string): Promise<string> {
    await this.open();
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret123' }),
    });
    const { token } = (await res.json()) as { token: string };
    this.send({ type: 'auth', token, towerColor: '#4CAF50' });
    const ok = await this.wait((m) => m.type === 'auth-ok' || m.type === 'error');
    if (ok.type !== 'auth-ok') throw new Error('auth failed: ' + JSON.stringify(ok));
    return token;
  }

  close(): void {
    this.ws.close();
  }
}

describe('lobby', () => {
  it('rejects unauthenticated connections', async () => {
    const client = new TestClient();
    await client.open();
    client.send({ type: 'host', levelId: 1 });
    const err = await client.wait((m) => m.type === 'error');
    expect(err.type).toBe('error');
    client.close();
  });

  it('rejects invalid tokens', async () => {
    const client = new TestClient();
    await client.open();
    client.send({ type: 'auth', token: 'bogus', towerColor: '#4CAF50' });
    const err = await client.wait((m) => m.type === 'error');
    expect(err.type).toBe('error');
    client.close();
  });

  it('host creates a room with a code', async () => {
    const host = new TestClient();
    await host.authenticate('host1');
    host.send({ type: 'host', levelId: 2 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    expect(roomMsg.type).toBe('room');
    if (roomMsg.type === 'room') {
      expect(roomMsg.room.code).toHaveLength(5);
      expect(roomMsg.room.hostId).toBeTruthy();
      expect(roomMsg.room.levelId).toBe(2);
      expect(roomMsg.room.players).toHaveLength(1);
      expect(roomMsg.room.players[0].host).toBe(true);
    }
    host.close();
  });

  it('second player joins with the room code', async () => {
    const host = new TestClient();
    const guest = new TestClient();
    await host.authenticate('host2');
    await guest.authenticate('guest2');

    host.send({ type: 'host', levelId: 1 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    if (roomMsg.type !== 'room') throw new Error('no room');
    const code = roomMsg.room.code;

    guest.send({ type: 'join', code });
    const joined = await guest.wait((m) => m.type === 'room');
    if (joined.type !== 'room') throw new Error('join failed');
    expect(joined.room.players).toHaveLength(2);

    // Host also sees the updated room
    const hostUpdate = await host.wait(
      (m) => m.type === 'room' && m.room.players.length === 2,
    );
    expect(hostUpdate.type).toBe('room');

    host.close();
    guest.close();
  });

  it('rejects joining a nonexistent room', async () => {
    const guest = new TestClient();
    await guest.authenticate('guest3');
    guest.send({ type: 'join', code: 'XXXXX' });
    const err = await guest.wait((m) => m.type === 'error');
    expect(err.type).toBe('error');
    guest.close();
  });

  it('relays chat messages to all room members', async () => {
    const host = new TestClient();
    const guest = new TestClient();
    await host.authenticate('host4');
    await guest.authenticate('guest4');

    host.send({ type: 'host', levelId: 1 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    if (roomMsg.type !== 'room') throw new Error('no room');
    guest.send({ type: 'join', code: roomMsg.room.code });
    await guest.wait((m) => m.type === 'room' && m.room.players.length === 2);

    guest.send({ type: 'chat', text: 'hello world' });
    const chat1 = await guest.wait((m) => m.type === 'chat');
    if (chat1.type !== 'chat') throw new Error('no chat');
    expect(chat1.text).toBe('hello world');
    expect(chat1.from).toBeTruthy();

    const chat2 = await host.wait((m) => m.type === 'chat');
    expect(chat2.type).toBe('chat');

    host.close();
    guest.close();
  });

  it('ready state broadcasts and only host can start', async () => {
    const host = new TestClient();
    const guest = new TestClient();
    await host.authenticate('host5');
    await guest.authenticate('guest5');

    host.send({ type: 'host', levelId: 1 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    if (roomMsg.type !== 'room') throw new Error('no room');
    guest.send({ type: 'join', code: roomMsg.room.code });
    await guest.wait((m) => m.type === 'room' && m.room.players.length === 2);

    guest.send({ type: 'ready', ready: true });
    const readyRoom = await host.wait(
      (m) => m.type === 'room' && m.room.players.some((p) => p.ready),
    );
    expect(readyRoom.type).toBe('room');

    // Guest cannot start
    guest.send({ type: 'start' });
    await new Promise((r) => setTimeout(r, 150));
    expect(host.messages.some((m) => m.type === 'start')).toBe(false);

    // Host can start
    host.send({ type: 'start' });
    const start = await host.wait((m) => m.type === 'start');
    if (start.type !== 'start') throw new Error('start failed');
    expect(start.room.status).toBe('started');
    expect(start.loadout).toHaveLength(3);

    const guestStart = await guest.wait((m) => m.type === 'start');
    expect(guestStart.type).toBe('start');

    host.close();
    guest.close();
  });

  it('relays game net messages to other players only', async () => {
    const host = new TestClient();
    const guest = new TestClient();
    await host.authenticate('host6');
    await guest.authenticate('guest6');

    host.send({ type: 'host', levelId: 1 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    if (roomMsg.type !== 'room') throw new Error('no room');
    guest.send({ type: 'join', code: roomMsg.room.code });
    await guest.wait((m) => m.type === 'room' && m.room.players.length === 2);
    host.send({ type: 'start' });
    await host.wait((m) => m.type === 'start');
    await guest.wait((m) => m.type === 'start');

    // Host broadcasts a snapshot
    host.send({
      type: 'net',
      data: {
        kind: 'snap',
        status: 'playing',
        gold: 200,
        lives: 20,
        wave: 1,
        waveTotal: 5,
        score: 0,
        enemies: [],
        towers: [{ id: 't1', type: 'arrow', col: 3, row: 4, level: 1, color: '#4CAF50' }],
      },
    });
    const snap = await guest.wait((m) => m.type === 'net');
    if (snap.type !== 'net') throw new Error('no net relay');
    expect(snap.data.kind).toBe('snap');
    if (snap.data.kind === 'snap') {
      expect(snap.data.gold).toBe(200);
      expect(snap.data.towers[0].type).toBe('arrow');
    }

    // Guest sends a command back
    guest.send({ type: 'net', data: { kind: 'cmd', cmd: { k: 'place', col: 5, row: 5, type: 'cannon' } } });
    const cmd = await host.wait((m) => m.type === 'net' && m.data.kind === 'cmd');
    if (cmd.type !== 'net' || cmd.data.kind !== 'cmd') throw new Error('no cmd relay');
    expect(cmd.data.cmd).toMatchObject({ k: 'place', col: 5, row: 5 });

    // Host received the relayed command from the guest
    expect(
      host.messages.filter((m) => m.type === 'net' && m.data.kind === 'cmd'),
    ).toHaveLength(1);
    // Guest must not receive its own message back
    expect(guest.messages.filter((m) => m.type === 'net' && m.data.kind === 'cmd')).toHaveLength(0);

    host.close();
    guest.close();
  });

  it('host transfer on host leaving', async () => {
    const host = new TestClient();
    const guest = new TestClient();
    await host.authenticate('host7');
    await guest.authenticate('guest7');

    host.send({ type: 'host', levelId: 1 });
    const roomMsg = await host.wait((m) => m.type === 'room');
    if (roomMsg.type !== 'room') throw new Error('no room');
    guest.send({ type: 'join', code: roomMsg.room.code });
    await guest.wait((m) => m.type === 'room' && m.room.players.length === 2);

    host.send({ type: 'leave' });
    const update = await guest.wait(
      (m) => m.type === 'room' && m.room.hostId !== roomMsg.room.hostId,
    );
    if (update.type !== 'room') throw new Error('no host transfer');
    expect(update.room.players).toHaveLength(1);
    expect(update.room.players[0].username).toBe('guest7');

    host.close();
    guest.close();
  });
});
