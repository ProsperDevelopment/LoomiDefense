// ============================================================
// Multiplayer lobby: WebSocket client + host/join UI with chat.
// ============================================================
import { showPanel, el, field, textInput, button, closeModal, getRoot } from './overlay';
import { userProfile } from '../../state/UserProfile';
import { getToken } from '../../api/client';
import { refreshTopbar, showAuthPanel } from './screens';
import type {
  ClientMessage,
  ServerMessage,
  RoomState,
  GameNetMessage,
  NetSnapshot,
  NetCommand,
} from '../../../shared/protocol';

type NetHandler = (from: string, data: GameNetMessage) => void;
type StartHandler = (room: RoomState, loadout: string[], levelId: number) => void;

class LobbyClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;

  room: RoomState | null = null;
  connected = false;

  private roomListeners = new Set<(room: RoomState | null) => void>();
  private chatListeners = new Set<(from: string, text: string) => void>();
  private errorListeners = new Set<(message: string) => void>();
  private netListeners = new Set<NetHandler>();
  private startListeners = new Set<StartHandler>();
  private closeListeners = new Set<() => void>();

  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = getToken();
    if (!token) {
      throw new Error('Log in first to play multiplayer');
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('Could not connect to server'));
      ws.addEventListener('open', () => {
        ws.removeEventListener('error', onError);
        resolve();
      }, { once: true });
      ws.addEventListener('error', onError, { once: true });
    });

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      this.handleMessage(msg);
    });
    ws.addEventListener('close', () => {
      this.connected = false;
      this.room = null;
      this.emitRoom(null);
      this.closeListeners.forEach((l) => l());
    });

    // Authenticate (server requires auth as first message)
    this.send({ type: 'auth', token: token!, towerColor: userProfile.towerColor, loadout: userProfile.loadout });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Auth timeout')), 4000);
      const onMsg = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'auth-ok') {
          clearTimeout(timer);
          ws.removeEventListener('message', onMsg);
          this.connected = true;
          resolve();
        } else if (msg.type === 'error') {
          clearTimeout(timer);
          ws.removeEventListener('message', onMsg);
          reject(new Error(msg.message));
        }
      };
      ws.addEventListener('message', onMsg);
    });
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room':
        this.room = msg.room;
        this.emitRoom(msg.room);
        break;
      case 'chat':
        this.chatListeners.forEach((l) => l(msg.from, msg.text));
        break;
      case 'error':
        this.errorListeners.forEach((l) => l(msg.message));
        break;
      case 'net':
        this.netListeners.forEach((l) => l(msg.from, msg.data));
        break;
      case 'start':
        this.room = msg.room;
        this.emitRoom(msg.room);
        this.startListeners.forEach((l) => l(msg.room, msg.loadout, msg.levelId));
        break;
      case 'left':
        // room update follows; nothing else needed
        break;
      case 'auth-ok':
        this.connected = true;
        break;
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  host(levelId: number): void { this.send({ type: 'host', levelId }); }
  join(code: string): void { this.send({ type: 'join', code }); }
  leave(): void { this.send({ type: 'leave' }); this.room = null; this.emitRoom(null); }
  chat(text: string): void { this.send({ type: 'chat', text }); }
  setReady(ready: boolean): void { this.send({ type: 'ready', ready }); }
  setLevel(levelId: number): void { this.send({ type: 'set-level', levelId }); }
  start(): void { this.send({ type: 'start' }); }
  sendNet(data: GameNetMessage): void { this.send({ type: 'net', data }); }
  sendSnapshot(snap: NetSnapshot): void { this.sendNet(snap); }
  sendCommand(cmd: NetCommand): void { this.sendNet({ kind: 'cmd', cmd }); }

  onRoom(fn: (room: RoomState | null) => void): () => void {
    this.roomListeners.add(fn);
    return () => this.roomListeners.delete(fn);
  }
  onChat(fn: (from: string, text: string) => void): () => void {
    this.chatListeners.add(fn);
    return () => this.chatListeners.delete(fn);
  }
  onError(fn: (message: string) => void): () => void {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }
  onNet(fn: NetHandler): () => void {
    this.netListeners.add(fn);
    return () => this.netListeners.delete(fn);
  }
  onStart(fn: StartHandler): () => void {
    this.startListeners.add(fn);
    return () => this.startListeners.delete(fn);
  }
  onClose(fn: () => void): () => void {
    this.closeListeners.add(fn);
    return () => this.closeListeners.delete(fn);
  }

  private emitRoom(room: RoomState | null): void {
    this.roomListeners.forEach((l) => l(room));
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.leave();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  isHost(): boolean {
    return !!this.room && !!userProfile.user && this.room.hostId === userProfile.user.id;
  }
}

export const lobby = new LobbyClient();

// ------------------------------------------------------------
// Lobby UI
// ------------------------------------------------------------

export function showLobbyPanel(): void {
  if (!userProfile.isLoggedIn) {
    showPanel((body, close) => {
      body.append(el('h2', undefined, 'Multiplayer'));
      body.append(el('p', 'hint', 'Log in to host or join multiplayer games.'));
      body.append(el('div', 'ov-row',
        button('Close', close, 'secondary'),
        button('Log In', () => {
          close();
          showAuthPanel();
        }),
      ));
    });
    return;
  }

  showPanel((body, close) => {
    body.append(el('h2', undefined, 'Multiplayer'));

    const content = el('div');
    body.append(content);

    const unsubs: Array<() => void> = [];
    const fullClose = () => {
      unsubs.forEach((u) => u());
      close();
    };

    // --- Landing view: host or join ---
    function renderLanding(errorMsg = ''): void {
      content.innerHTML = '';
      content.append(el('p', 'hint', 'Host a game and share the code, or join a friend with their code.'));

      const codeInput = textInput('text', 'ENTER CODE');
      codeInput.style.textTransform = 'uppercase';
      const error = el('div', 'ov-error', errorMsg);

      const hostBtn = button('Host Game', async () => {
        hostBtn.setAttribute('disabled', 'true');
        try {
          await lobby.connect();
          lobby.host(1);
        } catch (e) {
          error.textContent = e instanceof Error ? e.message : 'Connection failed';
          hostBtn.removeAttribute('disabled');
        }
      });

      const joinBtn = button('Join Game', async () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code.length !== 5) {
          error.textContent = 'Enter the 5-character room code';
          return;
        }
        joinBtn.setAttribute('disabled', 'true');
        try {
          await lobby.connect();
          lobby.join(code);
        } catch (e) {
          error.textContent = e instanceof Error ? e.message : 'Connection failed';
          joinBtn.removeAttribute('disabled');
        }
      }, 'secondary');

      content.append(
        field('Room code', codeInput),
        error,
        el('div', 'ov-row',
          button('Cancel', fullClose, 'secondary'),
          joinBtn,
          hostBtn,
        ),
      );
    }

    // --- Room view ---
    function renderRoom(): void {
      const room = lobby.room;
      if (!room) {
        renderLanding();
        return;
      }
      content.innerHTML = '';
      const isHost = lobby.isHost();

      // Room code display (host shares it)
      const codeRow = el('div', 'ov-row between');
      const codeLabel = el('div');
      codeLabel.append(el('h3', undefined, 'Room Code'));
      const codeText = el('div', undefined, room.code);
      codeText.style.cssText = 'font-size:32px;font-weight:800;letter-spacing:6px;color:#FFD700;font-family:monospace';
      codeLabel.append(codeText);
      codeRow.append(codeLabel);
      if (isHost) {
        const copy = button('Copy', () => {
          void navigator.clipboard?.writeText(room.code);
        }, 'secondary');
        copy.classList.add('small');
        codeRow.append(copy);
      }
      content.append(codeRow);

      // Level selector (host only)
      const levelRow = el('div', 'ov-row between');
      levelRow.append(el('span', undefined, `Level ${room.levelId}`));
      if (isHost) {
        const lvlInput = document.createElement('input');
        lvlInput.type = 'number';
        lvlInput.min = '1';
        lvlInput.max = '25';
        lvlInput.value = String(room.levelId);
        lvlInput.style.cssText = 'width:80px;padding:6px;background:#0d1b33;border:1px solid #33507a;border-radius:6px;color:#fff';
        lvlInput.addEventListener('change', () => {
          const v = parseInt(lvlInput.value, 10);
          if (v >= 1) lobby.setLevel(v);
        });
        levelRow.append(lvlInput);
      }
      content.append(levelRow);

      // Players
      const playerList = el('ul', 'ov-list');
      for (const p of room.players) {
        const li = el('li');
        const info = el('div');
        const nameRow = el('div');
        nameRow.append(document.createTextNode(p.displayName));
        if (p.host) {
          nameRow.append(document.createTextNode(' '));
          const badge = el('span', 'ov-badge', 'HOST');
          nameRow.append(badge);
        }
        info.append(nameRow);
        info.append(el('div', 'sub', `@${p.username}`));
        const right = el('div');
        const swatch = el('span');
        swatch.style.cssText = `display:inline-block;width:14px;height:14px;border-radius:4px;background:${p.color};margin-right:6px;vertical-align:middle`;
        right.append(swatch);
        right.append(el('span', 'sub', p.ready ? 'Ready ✓' : '…'));
        li.append(info, right);
        playerList.append(li);
      }
      content.append(el('h3', undefined, `Players (${room.players.length}/4)`), playerList);

      // Ready + start
      const me = room.players.find((p) => userProfile.user && p.id === userProfile.user.id);
      const controls = el('div', 'ov-row');
      const readyBtn = button(me?.ready ? 'Unready' : 'Ready Up', () => {
        lobby.setReady(!me?.ready);
      }, me?.ready ? 'secondary' : 'primary');
      controls.append(readyBtn);

      if (isHost) {
        const startBtn = button('Start Game', () => {
          lobby.start();
        });
        controls.append(startBtn);
      }
      content.append(controls);

      // Chat
      const chatLog = el('div', 'ov-chat');
      chatLogEl = chatLog;
      renderChatLog();
      const chatInput = textInput('text', 'Say something…');
      chatInput.style.flex = '1';
      const sendBtn = button('Send', () => {
        const t = chatInput.value.trim();
        if (t) {
          lobby.chat(t);
          chatInput.value = '';
        }
      }, 'secondary');
      sendBtn.classList.add('small');
      const chatRow = el('div', 'ov-row');
      chatRow.append(chatInput, sendBtn);
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendBtn.click();
      });
      content.append(el('h3', undefined, 'Chat'), chatLog, chatRow);

      const error = el('div', 'ov-error');
      errorEl = error;
      const leaveBtn = button('Leave', () => {
        lobby.leave();
        fullClose();
      }, 'danger');
      content.append(error, el('div', 'ov-row', leaveBtn));
    }

    // Wire lobby events
    unsubs.push(lobby.onRoom((room) => {
      if (room) renderRoom();
      else renderLanding();
    }));
    unsubs.push(lobby.onChat((from, text) => {
      chatHistory.push({ from, text });
      renderChatLog();
    }));
    unsubs.push(lobby.onError((message) => {
      if (errorEl && document.body.contains(errorEl)) {
        errorEl.textContent = message;
      }
      const landingErr = content.querySelector('.ov-error') as HTMLElement | null;
      if (landingErr && !lobby.room) landingErr.textContent = message;
    }));

    if (lobby.room) renderRoom();
    else renderLanding();
  });
}

// Module-level chat state (survives panel re-renders)
let chatHistory: Array<{ from: string; text: string }> = [];
let chatLogEl: HTMLElement | null = null;
let errorEl: HTMLElement | null = null;

function renderChatLog(): void {
  if (!chatLogEl || !document.body.contains(chatLogEl)) return;
  chatLogEl.innerHTML = '';
  for (const m of chatHistory.slice(-50)) {
    const line = el('div');
    const who = el('span', 'who', `${m.from}: `);
    line.append(who, document.createTextNode(m.text));
    chatLogEl.append(line);
  }
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

/** Called when the game starts: close lobby UI and hand control to GameScene. */
export function onLobbyStart(cb: (loadout: string[], levelId: number) => void): () => void {
  return lobby.onStart((_room, loadout, levelId) => {
    closeModal(getRoot());
    refreshTopbar();
    cb(loadout, levelId);
  });
}
