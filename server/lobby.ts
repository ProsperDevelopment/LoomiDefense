// ============================================================
// WebSocket multiplayer lobby: host/join rooms, chat, ready, start,
// and relays in-game net messages between room members.
// ============================================================
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { store } from './db';
import type {
  ClientMessage,
  ServerMessage,
  RoomState,
  RoomPlayer,
  GameNetMessage,
} from '../shared/protocol';

interface Room {
  code: string;
  hostId: string;
  levelId: number;
  status: 'lobby' | 'started';
  loadout: string[];
  players: Map<string, RoomPlayer>; // userId -> player (one socket per user)
  sockets: Map<string, WebSocket>; // userId -> socket
}

const rooms = new Map<string, Room>(); // code -> room
const userRooms = new Map<string, string>(); // userId -> room code
const userColors = new Map<string, string>(); // userId -> tower color
const userLoadouts = new Map<string, string[]>(); // userId -> chosen loadout (3-5 tower types)

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function roomToState(room: Room): RoomState {
  return {
    code: room.code,
    hostId: room.hostId,
    levelId: room.levelId,
    status: room.status,
    players: [...room.players.values()],
  };
}

function broadcast(room: Room, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function leaveRoom(userId: string, ws: WebSocket): void {
  const code = userRooms.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRooms.delete(userId);
  if (!room) return;

  const player = room.players.get(userId);
  room.players.delete(userId);
  room.sockets.delete(userId);

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === userId) {
    // Promote the next player to host
    const nextId = room.players.keys().next().value as string;
    room.hostId = nextId;
    const next = room.players.get(nextId);
    if (next) next.host = true;
  }

  broadcast(room, { type: 'left', userId, username: player?.displayName ?? 'Player' });
  broadcast(room, { type: 'room', room: roomToState(room) });
}

export function attachLobbyServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;

    ws.on('message', (raw: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      // Auth is the only message allowed before authentication
      if (msg.type === 'auth') {
        const id = store.findUserIdByToken(msg.token);
        if (!id) {
          send(ws, { type: 'error', message: 'Invalid session token' });
          ws.close(4001, 'unauthenticated');
          return;
        }
        userId = id;
        const user = store.findUserById(id);
        if (user && typeof msg.towerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.towerColor)) {
          userColors.set(id, msg.towerColor);
          user.settings.towerColor = msg.towerColor;
          store.updateUser(user);
        }
        // Remember this player's own loadout so the host can validate their builds
        if (Array.isArray(msg.loadout)) {
          const sanitized = [
            ...new Set(
              msg.loadout.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length <= 20),
            ),
          ].slice(0, 10);
          userLoadouts.set(id, sanitized);
        }
        send(ws, { type: 'auth-ok', userId: id, username: user?.displayName ?? 'Player' });
        return;
      }

      if (!userId) {
        send(ws, { type: 'error', message: 'Not authenticated' });
        return;
      }

      const color = userColors.get(userId) ?? store.findUserById(userId)?.settings.towerColor ?? '#4CAF50';
      const loadout = userLoadouts.get(userId) ?? [];
      const user = store.findUserById(userId)!;
      const playerInfo = (): RoomPlayer => ({
        id: userId!,
        username: user.username,
        displayName: user.displayName,
        color,
        loadout,
        ready: false,
        host: false,
      });

      switch (msg.type) {
        case 'host': {
          if (userRooms.has(userId)) {
            send(ws, { type: 'error', message: 'Already in a room' });
            return;
          }
          const code = generateCode();
          const room: Room = {
            code,
            hostId: userId,
            levelId: Number.isInteger(msg.levelId) ? msg.levelId : 1,
            status: 'lobby',
            loadout: [...user.progress.loadout],
            players: new Map(),
            sockets: new Map(),
          };
          room.players.set(userId, { ...playerInfo(), host: true });
          room.sockets.set(userId, ws);
          rooms.set(code, room);
          userRooms.set(userId, code);
          send(ws, { type: 'room', room: roomToState(room) });
          break;
        }

        case 'join': {
          if (userRooms.has(userId)) {
            send(ws, { type: 'error', message: 'Already in a room' });
            return;
          }
          const code = (msg.code ?? '').toUpperCase().trim();
          const room = rooms.get(code);
          if (!room) {
            send(ws, { type: 'error', message: 'Room not found' });
            return;
          }
          if (room.status !== 'lobby') {
            send(ws, { type: 'error', message: 'Game already started' });
            return;
          }
          if (room.players.size >= 4) {
            send(ws, { type: 'error', message: 'Room is full' });
            return;
          }
          room.players.set(userId, playerInfo());
          room.sockets.set(userId, ws);
          userRooms.set(userId, code);
          broadcast(room, { type: 'room', room: roomToState(room) });
          break;
        }

        case 'leave': {
          leaveRoom(userId, ws);
          break;
        }

        case 'chat': {
          const code = userRooms.get(userId);
          const room = code ? rooms.get(code) : undefined;
          if (!room) return;
          const text = String(msg.text ?? '').slice(0, 200).trim();
          if (!text) return;
          broadcast(room, { type: 'chat', from: user.displayName, text, ts: Date.now() });
          break;
        }

        case 'ready': {
          const code = userRooms.get(userId);
          const room = code ? rooms.get(code) : undefined;
          if (!room) return;
          const p = room.players.get(userId);
          if (p) p.ready = !!msg.ready;
          broadcast(room, { type: 'room', room: roomToState(room) });
          break;
        }

        case 'set-level': {
          const code = userRooms.get(userId);
          const room = code ? rooms.get(code) : undefined;
          if (!room || room.hostId !== userId) return;
          if (Number.isInteger(msg.levelId) && msg.levelId >= 1) {
            room.levelId = msg.levelId;
            broadcast(room, { type: 'room', room: roomToState(room) });
          }
          break;
        }

        case 'start': {
          const code = userRooms.get(userId);
          const room = code ? rooms.get(code) : undefined;
          if (!room || room.hostId !== userId || room.status === 'started') return;
          room.status = 'started';
          // Informational: the host's own loadout. Each player builds from
          // their own loadout (see per-player loadouts on RoomPlayer).
          room.loadout = [...user.progress.loadout];
          broadcast(room, {
            type: 'start',
            room: roomToState(room),
            loadout: room.loadout,
            levelId: room.levelId,
          });
          break;
        }

        case 'net': {
          const code = userRooms.get(userId);
          const room = code ? rooms.get(code) : undefined;
          if (!room || room.status !== 'started') return;
          const data = msg.data as GameNetMessage;
          if (!data || typeof data !== 'object') return;
          // Relay to everyone else in the room
          const payload: ServerMessage = { type: 'net', from: userId, data };
          const encoded = JSON.stringify(payload);
          for (const [uid, sock] of room.sockets) {
            if (uid !== userId && sock.readyState === WebSocket.OPEN) {
              sock.send(encoded);
            }
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      if (userId) leaveRoom(userId, ws);
    });
  });

  return wss;
}
