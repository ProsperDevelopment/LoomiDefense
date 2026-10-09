import Phaser from 'phaser';
import { userProfile } from '../state/UserProfile';
import { MAP_DEFINITIONS } from '../data/maps';
import { TOWER_DEFINITIONS } from '../data/towers';
import { api } from '../api/client';
import type { MapData, Difficulty } from '../types';
import { fetchServerLevel, cachedServerLevel } from '../data/serverLevels';
import { drawLevelPreview } from '../ui/levelPreview';
import { lobby } from '../ui/overlay/lobbyScreen';
import { ensureStyles, getRoot, el, button, closeModal } from '../ui/overlay/overlay';
import { refreshTopbar } from '../ui/overlay/screens';

type Tab = 'loadout' | 'level' | 'multiplayer';

/**
 * Combined play menu with tabs: Loadout · Level · Multiplayer.
 *
 * Host: full access to all tabs.
 * Guest: loadout only — level tab is disabled (host picks the level).
 */
export class PlayScene extends Phaser.Scene {
  private selectedLevel = 1;
  private isServerLevel = false;
  private selectedDifficulty: Difficulty | undefined;
  private multiplayerMode = false;
  private selected: string[] = [...userProfile.loadout];
  private serverLevels: Array<{ id: number; name: string; difficulty?: string }> = [];
  private levelTab: 'campaign' | 'server' = 'campaign';
  private activeTab: Tab = 'loadout';
  private cleanup: (() => void)[] = [];
  private chatHistory: Array<{ from: string; text: string }> = [];

  // DOM refs rebuilt each render
  private panel!: HTMLElement;
  private tabContent!: HTMLElement;
  private statusEl!: HTMLElement;
  private errorEl!: HTMLElement;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create(data?: { multiplayer?: boolean }): void {
    this.cameras.main.setBackgroundColor(0x1a1a2e);
    this.selectedLevel = 1;
    this.isServerLevel = false;
    this.selectedDifficulty = undefined;
    this.multiplayerMode = data?.multiplayer ?? false;
    this.selected = [...userProfile.loadout];
    this.activeTab = 'loadout';
    this.cleanup = [];

    ensureStyles();
    const root = getRoot();
    closeModal(root);

    const backdrop = document.createElement('div');
    backdrop.className = 'ov-backdrop';
    backdrop.dataset.modal = '1';

    this.panel = document.createElement('div');
    this.panel.className = 'ov-panel';
    this.panel.style.cssText = 'width:720px;height:520px;display:flex;flex-direction:column;overflow:hidden';

    this.buildShell();
    backdrop.appendChild(this.panel);
    root.appendChild(backdrop);

    const onBackdrop = (e: Event) => {
      if (e.target === backdrop) this.close();
    };
    backdrop.addEventListener('pointerdown', onBackdrop);
    this.cleanup.push(() => backdrop.remove(), () => backdrop.removeEventListener('pointerdown', onBackdrop));

    this.loadServerLevels();

    // Wire lobby events so the multiplayer tab live-updates
    this.cleanup.push(
      lobby.onRoom(() => { if (this.activeTab === 'multiplayer') this.renderActiveTab(); }),
      lobby.onChat((from, text) => {
        this.chatHistory.push({ from, text });
        if (this.activeTab === 'multiplayer') this.renderActiveTab();
      }),
    );
  }

  private close(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    if (this.scene.isActive('PlayScene')) {
      this.scene.start('MenuScene');
    }
  }

  // ── Shell (title + tabs + content + buttons) ─────────────

  private buildShell(): void {
    this.panel.innerHTML = '';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:0;margin:12px 0 0;border-bottom:2px solid rgba(255,255,255,0.1)';

    const isGuest = this.multiplayerMode && lobby.room && !lobby.isHost();
    const tabs: Array<{ key: Tab; label: string; disabled?: boolean }> = [
      { key: 'loadout', label: 'Loadout' },
      { key: 'level', label: 'Level', disabled: !!isGuest },
      { key: 'multiplayer', label: 'Multiplayer' },
    ];
    for (const t of tabs) {
      const btn = document.createElement('button');
      btn.textContent = t.label;
      btn.style.cssText = `padding:8px 20px;font-size:14px;border:none;cursor:pointer;background:transparent;color:${this.activeTab === t.key ? '#4CAF50' : '#888'};border-bottom:2px solid ${this.activeTab === t.key ? '#4CAF50' : 'transparent'};font-weight:${this.activeTab === t.key ? 'bold' : 'normal'};opacity:${t.disabled ? '0.4' : '1'};pointer-events:${t.disabled ? 'none' : 'auto'};transition:color 0.15s,border-color 0.15s`;
      btn.addEventListener('click', () => {
        this.activeTab = t.key;
        this.buildShell();
      });
      btn.addEventListener('mouseover', () => { if (!t.disabled && this.activeTab !== t.key) btn.style.color = '#ccc'; });
      btn.addEventListener('mouseout', () => { if (!t.disabled && this.activeTab !== t.key) btn.style.color = '#888'; });
      tabBar.append(btn);
    }
    this.panel.append(tabBar);

    // Tab content
    this.tabContent = document.createElement('div');
    this.tabContent.style.cssText = 'flex:1;overflow-y:auto;padding:12px 0';
    this.panel.append(this.tabContent);

    this.renderActiveTab();

    // Buttons
    const startLabel = this.multiplayerMode
      ? (lobby.isHost() ? 'Start Game' : 'Ready Up')
      : 'Start Game';
    const startBtn = button(startLabel, () => this.handleStart(), 'primary');
    const backBtn = button('Back', () => this.close(), 'secondary');
    const btnRow = el('div', 'ov-row', backBtn, startBtn);
    btnRow.style.marginTop = '12px';
    this.panel.append(btnRow);

    // Status / error
    this.statusEl = el('div', 'ov-status');
    this.errorEl = el('div', 'ov-error');
    this.panel.append(this.statusEl, this.errorEl);
  }

  private renderActiveTab(): void {
    this.tabContent.innerHTML = '';
    switch (this.activeTab) {
      case 'loadout': this.renderLoadoutTab(); break;
      case 'level': this.renderLevelTab(); break;
      case 'multiplayer': this.renderMultiplayerTab(); break;
    }
  }

  // ── Loadout tab ──────────────────────────────────────────

  private renderLoadoutTab(): void {
    this.tabContent.append(el('p', 'hint', 'Choose 3 to 5 towers to bring into battle.'));

    const cards = el('div', 'ov-cards');
    const info = el('div', 'ov-status');

    const render = (): void => {
      cards.innerHTML = '';
      for (const type of userProfile.ownedTowers) {
        const def = TOWER_DEFINITIONS[type];
        if (!def) continue;
        const isSel = this.selected.includes(type);
        const card = el('div', `ov-card${isSel ? ' selected' : ''}`);
        card.append(el('div', 'name', def.name));
        card.append(el('div', 'desc', def.description));
        card.append(el('div', 'price', `${def.cost}g · DMG ${def.damage} · RNG ${def.range}`));
        card.addEventListener('click', () => {
          if (isSel) {
            this.selected = this.selected.filter((t) => t !== type);
          } else if (this.selected.length < 5) {
            this.selected = [...this.selected, type];
          }
          render();
        });
        cards.append(card);
      }
      info.textContent = `${this.selected.length}/5 selected`;
    };
    render();
    this.tabContent.append(cards, info);
  }

  // ── Level tab ────────────────────────────────────────────

  private renderLevelTab(): void {
    // Difficulty row
    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display:flex;gap:6px;margin-bottom:10px';
    for (const [label, val] of [['Default', undefined], ['Easy', 'easy'], ['Medium', 'medium'], ['Hard', 'hard']] as const) {
      const b = button(label, () => {
        this.selectedDifficulty = val as Difficulty | undefined;
        this.renderActiveTab();
      }, this.selectedDifficulty === val ? 'primary' : 'secondary');
      b.style.cssText = 'padding:4px 10px;font-size:12px';
      diffRow.append(b);
    }
    this.tabContent.append(diffRow);

    // Campaign / Server sub-tabs
    const subRow = document.createElement('div');
    subRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px';
    const campBtn = button('Campaign', () => { this.levelTab = 'campaign'; this.renderActiveTab(); }, this.levelTab === 'campaign' ? 'primary' : 'secondary');
    const srvBtn = button('Server', () => { this.levelTab = 'server'; this.renderActiveTab(); }, this.levelTab === 'server' ? 'primary' : 'secondary');
    campBtn.style.cssText = srvBtn.style.cssText = 'padding:4px 10px;font-size:12px';
    subRow.append(campBtn, srvBtn);
    this.tabContent.append(subRow);

    // Level list + preview side by side
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;gap:10px;align-items:stretch;min-height:0';

    const grid = document.createElement('div');
    grid.style.cssText = 'flex:1;min-width:0;max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:6px;padding:8px';

    if (this.levelTab === 'campaign') {
      this.fillCampaignGrid(grid);
    } else {
      this.fillServerGrid(grid);
    }

    const previewBox = document.createElement('div');
    previewBox.style.cssText = 'width:250px;flex:none;display:flex;flex-direction:column;gap:6px';
    const preview = document.createElement('canvas');
    preview.style.cssText = 'width:250px;height:188px;background:rgba(0,0,0,0.35);border-radius:6px;display:block';
    const previewLabel = document.createElement('div');
    previewLabel.className = 'hint';
    previewBox.append(preview, previewLabel);
    this.renderPreview(preview, previewLabel);

    body.append(grid, previewBox);
    this.tabContent.append(body);
  }

  private renderPreview(canvas: HTMLCanvasElement, label: HTMLElement): void {
    const map = this.getPreviewMap();
    if (map) {
      drawLevelPreview(canvas, map);
      label.textContent = `${map.name || 'Level ' + map.id}${map.difficulty ? ` · ${map.difficulty}` : ''}`;
      return;
    }
    if (!this.isServerLevel) {
      label.textContent = 'No level selected';
      return;
    }
    label.textContent = 'Loading preview…';
    const id = this.selectedLevel;
    void fetchServerLevel(id).then((m) => {
      // Only paint if this is still the selected level
      if (this.isServerLevel && this.selectedLevel === id && canvas.isConnected && m) {
        drawLevelPreview(canvas, m);
        label.textContent = `${m.name || 'Level ' + m.id}${m.difficulty ? ` · ${m.difficulty}` : ''}`;
      }
    });
  }

  private getPreviewMap(): MapData | null {
    if (this.isServerLevel) {
      return cachedServerLevel(this.selectedLevel);
    }
    return MAP_DEFINITIONS.find((m) => m.id === this.selectedLevel) ?? null;
  }

  private fillCampaignGrid(grid: HTMLElement): void {
    for (let i = 1; i < MAP_DEFINITIONS.length; i++) {
      const map = MAP_DEFINITIONS[i];
      if (!map) continue;
      grid.append(this.levelRow(i, `${i}. ${map.name || 'Level ' + i}`, map.difficulty ?? 'easy', false));
    }
  }

  private fillServerGrid(grid: HTMLElement): void {
    if (this.serverLevels.length === 0) {
      grid.append(el('p', 'hint', 'No server levels found.'));
      return;
    }
    for (const lv of this.serverLevels) {
      grid.append(this.levelRow(lv.id, lv.name, lv.difficulty ?? '', true));
    }
  }

  private levelRow(id: number, name: string, meta: string, server: boolean): HTMLElement {
    const isActive = this.selectedLevel === id && this.isServerLevel === server;
    const row = document.createElement('div');
    row.style.cssText = `padding:6px 8px;margin:2px 0;border-radius:4px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center;background:${isActive ? 'rgba(76,175,80,0.3)' : 'transparent'};transition:background 0.1s`;
    row.innerHTML = `<span>${name}</span><span style="color:#888;font-size:11px">${meta}</span>`;
    row.addEventListener('click', () => { this.selectedLevel = id; this.isServerLevel = server; this.renderActiveTab(); });
    row.addEventListener('mouseover', () => { if (!isActive) row.style.background = 'rgba(255,255,255,0.05)'; });
    row.addEventListener('mouseout', () => { if (!isActive) row.style.background = 'transparent'; });
    return row;
  }

  // ── Multiplayer tab ──────────────────────────────────────

  private renderMultiplayerTab(): void {
    if (!userProfile.isLoggedIn) {
      this.tabContent.append(el('p', 'hint', 'Log in from the topbar to play multiplayer.'));
      return;
    }

    if (lobby.room) {
      this.renderRoomView();
    } else {
      this.renderLandingView();
    }
  }

  private renderLandingView(): void {
    this.tabContent.append(el('p', 'hint', 'Host a new game or join an existing one.'));

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.placeholder = 'Room code';
    codeInput.maxLength = 5;
    codeInput.style.cssText = 'width:100px;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:13px;text-transform:uppercase';

    const joinBtn = button('Join', () => this.handleJoin(codeInput.value.trim()), 'secondary');
    const hostBtn = button('Host New Game', () => this.handleHost(), 'primary');
    hostBtn.style.cssText = joinBtn.style.cssText = 'padding:8px 16px;font-size:13px';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px';
    row.append(hostBtn, codeInput, joinBtn);
    this.tabContent.append(row);
  }

  private renderRoomView(): void {
    const room = lobby.room;
    if (!room) { this.renderLandingView(); return; }
    const isHost = lobby.isHost();

    // Room code
    const codeRow = el('div', 'ov-row between');
    const codeLabel = el('div');
    codeLabel.append(el('h3', undefined, 'Room Code'));
    const codeText = el('div', undefined, room.code);
    codeText.style.cssText = 'font-size:32px;font-weight:800;letter-spacing:6px;color:#FFD700;font-family:monospace';
    codeLabel.append(codeText);
    codeRow.append(codeLabel);
    if (isHost) {
      const copy = button('Copy', () => { void navigator.clipboard?.writeText(room.code); }, 'secondary');
      copy.classList.add('small');
      codeRow.append(copy);
    }
    this.tabContent.append(codeRow);

    // Players
    const playerList = el('ul', 'ov-list');
    for (const p of room.players) {
      const li = el('li');
      const info = el('div');
      const nameRow = el('div');
      nameRow.append(document.createTextNode(p.displayName));
      if (p.host) {
        nameRow.append(document.createTextNode(' '));
        nameRow.append(el('span', 'ov-badge', 'HOST'));
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
    this.tabContent.append(el('h3', undefined, `Players (${room.players.length}/4)`), playerList);

    // Chat
    const chatLog = el('div', 'ov-chat');
    this.renderChatLog(chatLog);
    const chatInput = document.createElement('input');
    chatInput.type = 'text';
    chatInput.placeholder = 'Say something…';
    chatInput.style.cssText = 'flex:1;padding:6px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);color:#fff;font-size:13px';
    const sendBtn = button('Send', () => {
      const t = chatInput.value.trim();
      if (t) { lobby.chat(t); chatInput.value = ''; }
    }, 'secondary');
    sendBtn.classList.add('small');
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });
    this.tabContent.append(el('h3', undefined, 'Chat'), chatLog, el('div', 'ov-row', chatInput, sendBtn));

    // Leave
    const leaveBtn = button('Leave', () => {
      lobby.leave();
      this.chatHistory = [];
      this.multiplayerMode = false;
      this.renderActiveTab();
      this.buildShell();
    }, 'danger');
    this.tabContent.append(el('div', 'ov-row', leaveBtn));
  }

  private renderChatLog(container: HTMLElement): void {
    container.innerHTML = '';
    for (const m of this.chatHistory.slice(-50)) {
      const line = el('div');
      line.append(el('span', 'who', `${m.from}: `), document.createTextNode(m.text));
      container.append(line);
    }
    container.scrollTop = container.scrollHeight;
  }

  private async loadServerLevels(): Promise<void> {
    try {
      const data = await api.listLevels();
      this.serverLevels = data.map((l: any) => ({ id: l.id, name: l.name, difficulty: l.difficulty }));
    } catch { /* silent */ }
    if (this.activeTab === 'level' && this.levelTab === 'server') this.renderActiveTab();
  }

  // ── Multiplayer actions ──────────────────────────────────

  private async handleHost(): Promise<void> {
    try {
      await lobby.connect();
      lobby.host(this.selectedLevel);
      this.multiplayerMode = true;
      this.activeTab = 'multiplayer';
      this.buildShell();
    } catch (e: any) {
      this.errorEl.textContent = e.message || 'Failed to host';
    }
  }

  private async handleJoin(code: string): Promise<void> {
    if (!code) { this.errorEl.textContent = 'Enter a room code'; return; }
    try {
      await lobby.connect();
      lobby.join(code.toUpperCase());
      this.multiplayerMode = true;
      this.activeTab = 'multiplayer';
      this.buildShell();
    } catch (e: any) {
      this.errorEl.textContent = e.message || 'Failed to join';
    }
  }

  // ── Start ────────────────────────────────────────────────

  private async handleStart(): Promise<void> {
    this.errorEl.textContent = '';

    if (this.selected.length < 3 || this.selected.length > 5) {
      this.errorEl.textContent = 'Select 3 to 5 towers';
      this.activeTab = 'loadout';
      this.buildShell();
      return;
    }
    await userProfile.setLoadout(this.selected);
    refreshTopbar();

    if (this.multiplayerMode) {
      if (lobby.isHost()) {
        lobby.setLevel(this.selectedLevel);
        lobby.setReady(true);
        lobby.start();
      } else {
        lobby.setReady(true);
        this.statusEl.textContent = 'Waiting for host to start...';
      }
    } else {
      const startData: { levelId: number; difficulty?: Difficulty; map?: MapData } = {
        levelId: this.selectedLevel,
        difficulty: this.selectedDifficulty,
      };
      if (this.isServerLevel) {
        this.statusEl.textContent = 'Loading level...';
        const map = await fetchServerLevel(this.selectedLevel);
        if (!map) {
          this.statusEl.textContent = '';
          this.errorEl.textContent = 'Failed to load server level';
          return;
        }
        startData.map = map;
      }
      this.cleanup.forEach((fn) => fn());
      this.cleanup = [];
      this.scene.start('GameScene', startData);
    }
  }
}
