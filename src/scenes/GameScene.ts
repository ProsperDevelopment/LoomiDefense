import Phaser from 'phaser';
import type { TowerType, EnemyType, TargetMode, MapData } from '../types';
import { Grid } from '../utils/Grid';
import { Pathfinding } from '../utils/Pathfinding';
import { collectBgTileLoads, bgTileKey } from '../utils/backgroundTiles';
import { WaveManager } from '../systems/WaveManager';
import { EconomySystem } from '../systems/EconomySystem';
import { PlayerEconomy } from '../systems/PlayerEconomy';
import { HealthSystem } from '../systems/HealthSystem';
import { TargetingSystem, type TargetableEntity } from '../systems/TargetingSystem';
import { Tower } from '../entities/Tower';
import { Enemy } from '../entities/Enemy';
import { Position } from '../components/Position';
import { Projectile } from '../entities/Projectile';
import { HUD } from '../ui/HUD';
import { TowerPanel } from '../ui/TowerPanel';
import { WaveIndicator } from '../ui/WaveIndicator';
import { MAP_DEFINITIONS } from '../data/maps';
import { TOWER_DEFINITIONS, MAX_TOWER_LEVEL } from '../data/towers';
import { userProfile } from '../state/UserProfile';
import { lobby } from '../ui/overlay/lobbyScreen';
import type { NetSnapshot, NetCommand, NetStatus } from '../../shared/protocol';
import { CELL_SIZE, STARTING_LIVES, COLORS, DEV_MODE, STARTING_GOLD, GRID_OFFSET_Y, COINS_PER_LEVEL_WIN, livesForDifficulty } from '../config/constants';
import { eventBus } from '../utils/EventBus';
import { isWaveResolved } from '../utils/waveCompletion';
import { canDamageEnemy } from '../utils/damageRules';

/** Bodies that share the blood landing pipeline (blood arcs, death debris images). */
type SplatterBody = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;

export class GameScene extends Phaser.Scene {
  private grid!: Grid;
  private pathfinding!: Pathfinding;
  private waveManager!: WaveManager;
  private economy!: EconomySystem;
  private healthSystem!: HealthSystem;

  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];

  private lives: number = STARTING_LIVES;
  private score: number = 0;
  private selectedTowerType: TowerType | null = null;
  private selectedTower: Tower | null = null;
  private isGameOver: boolean = false;
  private gameSpeed: number = 1;
  private speedButton!: Phaser.GameObjects.Container;

  private hud!: HUD;
  private towerPanel!: TowerPanel;
  private waveIndicator!: WaveIndicator;

  private hoverIndicator: Phaser.GameObjects.Rectangle | null = null;
  private hoverRangeCircle: Phaser.GameObjects.Arc | null = null;
  private hoverCol: number = -1;
  private hoverRow: number = -1;
  private enemiesSpawnedInWave: number = 0;
  private currentLevelId: number = 1;
  private selectedEnemy: Enemy | null = null;
  private targetSight: Phaser.GameObjects.Graphics | null = null;
  private pendingBuildPos: { col: number; row: number } | null = null;
  private pendingRangeCircle: Phaser.GameObjects.Arc | null = null;
  private popupClickHandled: boolean = false;

  // Multiplayer state
  private netRole: 'host' | 'guest' | null = null;
  private loadoutTypes: TowerType[] = [];
  /** Multiplayer host: each player's own loadout (userId → tower types). */
  private remoteLoadouts = new Map<string, string[]>();
  private lobbyUnsubs: Array<() => void> = [];
  private pendingSnaps: NetSnapshot[] = [];
  private snapshotTimer: number = 0;
  private guestWaveNumber: number = 0;
  /** Per-level background tile loading (see drawBackgroundTiles). */
  private bgTileEpoch: number = 0;
  private bgTileLoadActive: boolean = false;
  private bgTilesAttempted = new Set<string>();
  /** Per-player gold: players never share economics (see PlayerEconomy). */
  private playerEcon: PlayerEconomy | null = null;
  private guestEnemyTargets = new Map<string, { x: number; y: number }>();
  private guestProjectiles = new Map<string, { img: Phaser.GameObjects.Image; tx: number; ty: number }>();

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data: { levelId?: number; netRole?: 'host' | 'guest' }): void {
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    this.resetState();

    // Per-level background tile loading state
    this.bgTileEpoch++;
    this.bgTileLoadActive = false;
    this.bgTilesAttempted.clear();

    // Stop the menu scenes so their (invisible, behind-us) buttons can
    // never receive clicks meant for the game — a stray PLAY click used
    // to restart the match at level 1.
    if (this.scene.isActive('MenuScene')) this.scene.stop('MenuScene');
    if (this.scene.isActive('LevelSelectScene')) this.scene.stop('LevelSelectScene');

    this.netRole = data.netRole ?? null;
    this.pendingSnaps = [];
    this.snapshotTimer = 0;
    this.guestEnemyTargets.clear();
    this.guestProjectiles.clear();

    // Every player builds from THEIR OWN selected loadout (multiplayer too)
    this.loadoutTypes = userProfile.loadout.filter((t): t is TowerType => t in TOWER_DEFINITIONS);
    if (this.loadoutTypes.length === 0) {
      this.loadoutTypes = ['arrow', 'cannon', 'frost'];
    }

    // Host keeps every player's loadout to validate their build commands
    this.remoteLoadouts.clear();
    if (this.netRole === 'host' && lobby.room) {
      for (const p of lobby.room.players) {
        this.remoteLoadouts.set(p.id, p.loadout ?? []);
      }
    }

    const levelId = data.levelId !== undefined ? data.levelId : 1;
    this.currentLevelId = levelId;
    const mapIndex = MAP_DEFINITIONS.findIndex(m => m.id === levelId);
    const mapData = MAP_DEFINITIONS[mapIndex >= 0 ? mapIndex : 0];

    this.grid = new Grid(mapData);
    this.blockSmoothRoadCells();
    this.pathfinding = new Pathfinding(this.grid);

    // Level-defined waves first; dev demo keeps its special set
    const waves = mapData.waves;
    this.waveManager = new WaveManager(waves);

    // Starting gold comes from the level JSON (default 500)
    const startingGold = mapData.startGold ?? STARTING_GOLD;
    this.economy = new EconomySystem(startingGold);

    // Multiplayer: every player starts with their own gold pot.
    // The host's pot is this.economy; other players are ledger entries.
    const otherIds = this.netRole === 'host' && lobby.room
      ? lobby.room.players.map((p) => p.id).filter((id) => id !== this.myPlayerId())
      : [];
    this.playerEcon = new PlayerEconomy(
      this.myPlayerId(),
      this.economy,
      this.netRole !== null,
      otherIds,
      startingGold,
    );

    this.healthSystem = new HealthSystem();

    this.setLevelLives(levelId);

    eventBus.clear();
    this.drawGrid();
    this.createUI();
    this.setupInput();
    this.setupEvents();

    this.waveManager.onSpawnEnemy = (type) => this.spawnEnemy(type);

    // Multiplayer: wire lobby net handlers
    this.setupNetHandlers();

    // Start first wave after a short delay (host/solo only; guests wait for snapshots)
    if (this.netRole !== 'guest') {
      this.time.delayedCall(2000, () => {
        this.startNextWave();
      });
    }

    // Clean up lobby listeners when leaving the scene
    this.events.once('shutdown', () => {
      this.lobbyUnsubs.forEach((u) => u());
      this.lobbyUnsubs = [];
      if (this.netRole) {
        lobby.leave();
        this.netRole = null;
      }
      this.hideGuestOverlays();
    });
  }

  private setupNetHandlers(): void {
    if (!this.netRole) return;

    this.lobbyUnsubs.push(
      lobby.onNet((from, data) => {
        if (this.isGameOver) return;
        if (this.netRole === 'host' && data.kind === 'cmd') {
          this.applyNetCommand(from, data.cmd);
        } else if (this.netRole === 'guest' && data.kind === 'snap') {
          this.pendingSnaps.push(data);
        }
      }),
      lobby.onClose(() => {
        // Connection lost mid-game: return to menu
        if (!this.isGameOver && this.netRole === 'guest') {
          this.scene.start('MenuScene');
        }
      }),
    );
  }

  private hideGuestOverlays(): void {
    for (const { img } of this.guestProjectiles.values()) img.destroy();
    this.guestProjectiles.clear();
    this.guestEnemyTargets.clear();
  }

  private resetState(): void {
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.lives = STARTING_LIVES;
    this.score = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.isGameOver = false;
    this.enemiesSpawnedInWave = 0;
    this.playerEcon = null; // rebuilt in create() once the net role is known
  }

  // ------------------------------------------------------------
  // Per-player economy (multiplayer): players never share gold.
  // All pots are tracked by PlayerEconomy; the host validates every
  // remote action against the acting player's own pot.
  // ------------------------------------------------------------

  private myPlayerId(): string {
    return userProfile.user?.id ?? 'local';
  }

  private goldOf(playerId: string): number {
    return this.playerEcon?.goldOf(playerId) ?? this.economy.getGold();
  }

  private addGold(playerId: string, amount: number): void {
    if (this.playerEcon) this.playerEcon.add(playerId, amount);
    else if (amount > 0) this.economy.earn(amount);
    else if (amount < 0) this.economy.spend(-amount);
  }

  /** Deduct from the acting player's own pot. False if they can't afford it. */
  private spendGold(playerId: string, amount: number): boolean {
    if (this.playerEcon) return this.playerEcon.spend(playerId, amount);
    return this.economy.spend(amount);
  }

  /** Update the HUD with this player's own gold. */
  private refreshOwnGoldHud(): void {
    this.hud.setGold(this.goldOf(this.myPlayerId()));
  }

  private setLevelLives(levelId: number): void {
    if (levelId === 0) {
      // Dev demo gets a big pool
      this.lives = 250;
    } else {
      // Lives come from the level's difficulty (easy 20 / medium 5 / hard 1)
      this.lives = livesForDifficulty(this.grid.getMapData().difficulty);
    }
  }

  private createUI(): void {
    this.hud = new HUD(this);
    this.hud.setGold(this.economy.getGold());
    this.hud.setLives(this.lives);
    this.hud.setWave(0, this.waveManager.getTotalWaves());

    this.towerPanel = new TowerPanel(this, {
      onTowerSelect: (type) => { if (type) this.onBuildTowerSelect(type); },
      onSellTower: () => this.onSellTower(),
      onUpgradeTower: () => this.onUpgradeTower(),
      canAfford: (cost) => this.economy.canAfford(cost),
      onCancel: () => this.cancelPendingBuild(),
    });
    this.towerPanel.setAvailableTypes(this.loadoutTypes);

    this.waveIndicator = new WaveIndicator(this, () => this.startNextWave(), () => this.startWaveEarly());
    this.waveIndicator.setWave(0, this.waveManager.getTotalWaves());

    this.hoverIndicator = this.add.rectangle(0, 0, CELL_SIZE / 2 - 2, CELL_SIZE / 2 - 2, 0x4CAF50, 0.3);
    this.hoverIndicator.setStrokeStyle(2, 0x4CAF50);
    this.hoverIndicator.setVisible(false);
    this.hoverIndicator.setDepth(50);

    // Hover range circle (shown in build mode)
    this.hoverRangeCircle = this.add.circle(0, 0, 100, 0xffffff, 0);
    this.hoverRangeCircle.setStrokeStyle(1, 0xffffff, 0.4);
    this.hoverRangeCircle.setVisible(false);
    this.hoverRangeCircle.setDepth(49);

    // Pending build range circle (frozen target)
    this.pendingRangeCircle = this.add.circle(0, 0, 100, 0xffffff, 0);
    this.pendingRangeCircle.setStrokeStyle(2, 0x4CAF50, 0.6);
    this.pendingRangeCircle.setVisible(false);
    this.pendingRangeCircle.setDepth(48);

    this.createSpeedButton();
  }

  private createSpeedButton(): void {
    const btn = this.add.container(980, 50);
    btn.setDepth(100);

    const bg = this.add.rectangle(0, 0, 60, 30, 0x333355);
    bg.setStrokeStyle(2, 0x555577);

    const text = this.add.text(0, 0, '1x', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.add([bg, text]);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
      text.setText(`${this.gameSpeed}x`);
      bg.setFillStyle(this.gameSpeed === 2 ? 0x4CAF50 : 0x333355);
    });
    bg.on('pointerover', () => bg.setFillStyle(0x444466));
    bg.on('pointerout', () => bg.setFillStyle(this.gameSpeed === 2 ? 0x4CAF50 : 0x333355));

    this.speedButton = btn;
  }

  private setupInput(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-U', () => this.onUpgradeTower());
    this.input.keyboard?.on('keydown-X', () => this.onSellTower());
    this.input.keyboard?.on('keydown-ESC', () => {
      this.selectedTowerType = null;
      this.towerPanel.hide();
      this.deselectTower();
      this.deselectEnemy();
    });
  }

  private setupEvents(): void {
    eventBus.on('enemy-killed', (p) => {
      // Kill rewards go to the owner of the tower that landed the kill
      this.addGold(p.ownerId ?? this.myPlayerId(), p.reward);
      this.score += p.reward;
      this.refreshOwnGoldHud();
      this.hud.setScore(this.score);
      this.checkWaveComplete();
    });

    eventBus.on('enemy-reached-base', (p) => {
      this.lives -= p.damage;
      this.hud.setLives(this.lives);
      this.checkWaveComplete();
      if (this.lives <= 0) this.gameOver(false);
    });
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver) return;

    // Guest: mirror the host's state instead of simulating locally
    if (this.netRole === 'guest') {
      this.updateGuest(delta);
      return;
    }

    const scaledDelta = delta * this.gameSpeed;
    this.waveManager.update(scaledDelta);
    this.updateEnemies(scaledDelta);
    this.updateTowerCombat(scaledDelta);
    this.updateProjectiles(scaledDelta);

    // Host: broadcast snapshots ~10x per second
    if (this.netRole === 'host') {
      this.snapshotTimer += delta;
      if (this.snapshotTimer >= 100) {
        this.snapshotTimer = 0;
        this.sendSnapshot('playing');
      }
    }

    // Update target sight position
    this.updateTargetSight();

    // Update wave indicator countdown
    if (this.waveManager.isWaitingForNextWave()) {
      this.waveIndicator.showCountdown(true);
      this.waveIndicator.setCountdown(this.waveManager.getAutoStartTimer());
      this.waveIndicator.showStartButton(true);
      this.waveIndicator.setBonusText(`Bonus: +${this.waveManager.getEarlyStartBonus()}g`);
    } else {
      this.waveIndicator.showCountdown(false);
      this.waveIndicator.setBonusText('');
    }
  }

  // ------------------------------------------------------------
  // Multiplayer: guest rendering from host snapshots
  // ------------------------------------------------------------

  private updateGuest(delta: number): void {
    // Apply the newest snapshot (drop stale queued ones)
    while (this.pendingSnaps.length > 1) this.pendingSnaps.shift();
    const snap = this.pendingSnaps.shift();
    if (snap) this.applySnapshot(snap);

    // Interpolate enemies toward their network targets
    for (const enemy of this.enemies) {
      const t = this.guestEnemyTargets.get(enemy.id);
      if (!t) continue;
      const k = Math.min(1, delta / 90);
      enemy.position.x += (t.x - enemy.position.x) * k;
      enemy.position.y += (t.y - enemy.position.y) * k;
      enemy.refresh();
    }

    // Interpolate projectile visuals
    for (const { img, tx, ty } of this.guestProjectiles.values()) {
      const k = Math.min(1, delta / 90);
      img.x += (tx - img.x) * k;
      img.y += (ty - img.y) * k;
    }

    this.updateTargetSight();

    // Guests can always ask the host to start the next wave
    this.waveIndicator.showCountdown(false);
    this.waveIndicator.setBonusText('');
    this.waveIndicator.showStartButton(true);
  }

  private applySnapshot(snap: NetSnapshot): void {
    // Economy/HUD mirrors (only touch when changed to avoid text spam).
    // Guests see THEIR OWN gold, not the host's (economies are per-player).
    const myId = this.myPlayerId();
    const myGold = snap.golds && myId in snap.golds ? snap.golds[myId] : snap.gold;
    if (this.economy.getGold() !== myGold) {
      this.economy.reset(myGold);
      this.hud.setGold(myGold);
    }
    if (this.lives !== snap.lives) {
      this.lives = snap.lives;
      this.hud.setLives(snap.lives);
    }
    if (this.score !== snap.score) {
      this.score = snap.score;
      this.hud.setScore(snap.score);
    }
    this.hud.setWave(snap.wave, snap.waveTotal);
    this.waveIndicator.setWave(snap.wave, snap.waveTotal);
    this.guestWaveNumber = snap.wave;

    this.syncGuestTowers(snap.towers);
    this.syncGuestEnemies(snap.enemies);
    this.syncGuestProjectiles(snap.projectiles ?? []);

    if (snap.status === 'won') this.gameOver(true);
    else if (snap.status === 'lost') this.gameOver(false);
  }

  private syncGuestTowers(snaps: Array<{ id: string; type: string; col: number; row: number; level: number; color: string; ownerId?: string }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let tower = this.towers.find((t) => t.id === s.id);
      if (!tower) {
        if (!(s.type in TOWER_DEFINITIONS)) continue;
        tower = new Tower(s.type as TowerType, s.col, s.row, s.id);
        tower.ownerId = s.ownerId ?? null;
        if (s.color) tower.setPlayerColor(s.color);
        tower.createSprite(this);
        tower.showRange(false);
        this.towers.push(tower);
        if (this.grid.canPlaceAtBg(s.col, s.row, s.type as TowerType)) {
          this.grid.placeTowerAtBg(s.col, s.row, s.type as TowerType);
        }
        while (tower.level < s.level) tower.upgrade();
      } else {
        tower.ownerId = s.ownerId ?? tower.ownerId;
        // Apply upgrades accepted by the host (level only ever goes up;
        // selling removes the tower entirely instead)
        if (tower.level < s.level) {
          while (tower.level < s.level) tower.upgrade();
          // Any open info popup now shows stale stats
          if (this.selectedTower === tower) this.towerPanel.hide();
        }
      }
    }
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const tower = this.towers[i];
      if (!seen.has(tower.id)) {
        if (this.selectedTower === tower) this.deselectTower();
        this.grid.removeTowerAtBg(tower.getGridCol(), tower.getGridRow());
        tower.destroy();
        this.towers.splice(i, 1);
      }
    }
  }

  private syncGuestEnemies(snaps: Array<{ id: string; type: string; x: number; y: number; hp: number; hpMax: number }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let enemy = this.enemies.find((e) => e.id === s.id);
      if (!enemy) {
        const path = this.grid.getPathPixels();
        enemy = new Enemy(s.type as EnemyType, path, s.id);
        enemy.createSprite(this);
        this.enemies.push(enemy);
        enemy.position.set(s.x, s.y);
      }
      enemy.health.current = Math.max(1, Math.min(s.hp, enemy.health.max));
      this.guestEnemyTargets.set(s.id, { x: s.x, y: s.y });
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!seen.has(enemy.id)) {
        if (this.selectedEnemy === enemy) this.deselectEnemy();
        this.guestEnemyTargets.delete(enemy.id);
        enemy.destroy();
        this.enemies.splice(i, 1);
      }
    }
  }

  private syncGuestProjectiles(snaps: Array<{ id: string; type: string; x: number; y: number }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let entry = this.guestProjectiles.get(s.id);
      if (!entry) {
        const key = `projectile_${s.type}`;
        if (!this.textures.exists(key)) continue;
        const img = this.add.image(s.x, s.y, key);
        img.setDisplaySize(12, 12);
        img.setDepth(15);
        entry = { img, tx: s.x, ty: s.y };
        this.guestProjectiles.set(s.id, entry);
      }
      entry.tx = s.x;
      entry.ty = s.y;
    }
    for (const [id, entry] of this.guestProjectiles) {
      if (!seen.has(id)) {
        entry.img.destroy();
        this.guestProjectiles.delete(id);
      }
    }
  }

  // ------------------------------------------------------------
  // Multiplayer: host snapshot + command application
  // ------------------------------------------------------------

  private sendSnapshot(status: NetStatus): void {
    if (this.netRole !== 'host') return;
    // Per-player gold: each player has their own pot
    const golds = this.playerEcon?.toRecord() ?? { [this.myPlayerId()]: this.economy.getGold() };
    lobby.sendSnapshot({
      kind: 'snap',
      status,
      gold: this.economy.getGold(),
      golds,
      lives: this.lives,
      wave: this.waveManager.getWaveNumber(),
      waveTotal: this.waveManager.getTotalWaves(),
      score: this.score,
      enemies: this.enemies
        .filter((e) => e.alive && !e.isDead())
        .map((e) => ({
          id: e.id,
          type: e.type,
          x: Math.round(e.position.x),
          y: Math.round(e.position.y),
          hp: e.health.current,
          hpMax: e.health.max,
        })),
      towers: this.towers.map((t) => ({
        id: t.id,
        type: t.type,
        col: t.getGridCol(),
        row: t.getGridRow(),
        level: t.level,
        color: t.tintColorHex ?? userProfile.towerColor,
        ownerId: t.ownerId ?? undefined,
      })),
      projectiles: this.projectiles
        .filter((p) => p.alive)
        .map((p) => ({ id: p.id, type: p.getTowerType(), x: Math.round(p.position.x), y: Math.round(p.position.y) })),
    });
  }

  private applyNetCommand(from: string, cmd: NetCommand): void {
    // Color of the player who issued the command
    const senderColor =
      lobby.room?.players.find((p) => p.id === from)?.color ?? userProfile.towerColor;

    switch (cmd.k) {
      case 'place':
        this.placeTower(cmd.col, cmd.row, cmd.type as TowerType, from, senderColor);
        break;
      case 'upgrade': {
        const tower = this.towers.find((t) => t.id === cmd.id);
        if (tower) this.upgradeTower(tower, from);
        break;
      }
      case 'sell': {
        const tower = this.towers.find((t) => t.id === cmd.id);
        if (tower) this.sellTower(tower, from);
        break;
      }
      case 'wave':
        this.startNextWave();
        break;
      case 'early':
        this.startWaveEarly(from);
        break;
    }
  }

  private updateTargetSight(): void {
    if (this.selectedEnemy) {
      if (!this.selectedEnemy.alive || this.selectedEnemy.isDead()) {
        this.deselectEnemy();
      } else {
        this.drawTargetSight(this.selectedEnemy.position.x, this.selectedEnemy.position.y);
      }
    }
  }

  private drawGrid(): void {
    const mapData = this.grid.getMapData();

    // Chessboard ground: exact colors from the level JSON (levels that
    // don't specify them fall back to the classic green pair). Solid
    // fills — a tinted grass texture would tint every color green.
    const groundLight = mapData.groundColor ?? 0x8a8c4e;
    const groundDark = mapData.groundColorDark ?? 0x9a9c5e;
    for (let row = 0; row < this.grid.rows; row++) {
      for (let col = 0; col < this.grid.cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE + GRID_OFFSET_Y;
        const isDark = (row + col) % 2 === 0;
        this.add.rectangle(
          x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE, CELL_SIZE,
          isDark ? groundDark : groundLight,
        );
      }
    }

    // Draw smooth road
    this.drawSmoothRoad(mapData.roadColor, mapData.roadColorDark);

    // Background tiles on top of the ground — loaded on demand for this level
    this.drawBackgroundTiles(mapData);

    for (const spawn of this.grid.getSpawnPixels()) {
      this.add.rectangle(spawn.x, spawn.y + GRID_OFFSET_Y, 20, 20, 0xe74c3c, 0.7);
      this.add.text(spawn.x, spawn.y + GRID_OFFSET_Y, 'S', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }

    const basePixels = this.grid.getPathPixels();
    const basePos = basePixels[basePixels.length - 1];
    if (basePos) {
      this.add.rectangle(basePos.x, basePos.y + GRID_OFFSET_Y, 24, 24, 0x4CAF50, 0.7);
      this.add.text(basePos.x, basePos.y + GRID_OFFSET_Y, 'B', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setOrigin(0.5);
    }
  }

  /**
   * Draw the level's background tile layer, loading any missing tile
   * textures first (tiles are fetched per level — not at game boot).
   */
  private drawBackgroundTiles(mapData: MapData): void {
    if (!mapData.bgTiles || mapData.bgTiles.length === 0) return;

    const loads = collectBgTileLoads(mapData.bgTiles);
    // Tiles we still need to fetch (skip ones already attempted this visit —
    // a failed download must not cause an endless retry loop)
    const pending = loads.filter(
      (l) => !this.textures.exists(l.key) && !this.bgTilesAttempted.has(l.key),
    );

    if (pending.length > 0) {
      if (this.bgTileLoadActive) return; // load in flight — the 'complete' callback redraws
      this.bgTileLoadActive = true;
      const epoch = this.bgTileEpoch;
      this.load.once('complete', () => {
        if (epoch !== this.bgTileEpoch) return; // scene restarted meanwhile
        this.bgTileLoadActive = false;
        this.drawBackgroundTiles(mapData);
      });
      for (const { key, url } of pending) {
        this.bgTilesAttempted.add(key);
        this.load.image(key, url);
      }
      this.load.start();
      return;
    }

    // Everything available — draw the layer (missing/failed tiles are skipped)
    const bgCellSize = CELL_SIZE / 2;
    for (let row = 0; row < mapData.bgTiles.length; row++) {
      for (let col = 0; col < mapData.bgTiles[row].length; col++) {
        const tileIdx = mapData.bgTiles[row][col];
        if (tileIdx < 0) continue;
        const tileKey = bgTileKey(tileIdx);
        if (tileKey && this.textures.exists(tileKey)) {
          // Foreground-marked tiles draw above gameplay (20);
          // regular background tiles sit below health bars etc. (10).
          const isFg = mapData.fgAreas?.[row]?.[col] === 'fg';
          this.add.image(col * bgCellSize + bgCellSize / 2, row * bgCellSize + GRID_OFFSET_Y + bgCellSize / 2, tileKey)
            .setDisplaySize(bgCellSize, bgCellSize)
            .setDepth(isFg ? 20 : 10);
        }
      }
    }
  }

  private drawSmoothRoad(roadColor?: number, roadColorDark?: number): void {
    const pathPixels = this.grid.getPathPixels();
    if (pathPixels.length < 2) return;

    const graphics = this.add.graphics();
    // graphics.setDepth(1);

    // Convert grid points to smooth curve points
    const smoothPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < pathPixels.length; i++) {
      smoothPoints.push({ x: pathPixels[i].x, y: pathPixels[i].y });
    }

    const fill = roadColor ?? 0x7a7a7a;
    const outline = roadColorDark ?? this.shadeColor(fill, 0.6);
    const center = this.shadeColor(fill, 1.3);

    // Draw road outline (darker)
    graphics.lineStyle(36, outline, 1);
    this.drawSmoothPath(graphics, smoothPoints);

    // Draw road fill
    graphics.lineStyle(28, fill, 1);
    this.drawSmoothPath(graphics, smoothPoints);

    // Draw road center line (lighter)
    graphics.lineStyle(2, center, 0.5);
    this.drawSmoothPath(graphics, smoothPoints);
  }

  /** Multiply RGB channels of a color by a factor (clamped to 0-255). */
  private shadeColor(color: number, factor: number): number {
    const r = Math.min(255, Math.round(((color >> 16) & 0xFF) * factor));
    const g = Math.min(255, Math.round(((color >> 8) & 0xFF) * factor));
    const b = Math.min(255, Math.round((color & 0xFF) * factor));
    return (r << 16) | (g << 8) | b;
  }

  private drawSmoothPath(graphics: Phaser.GameObjects.Graphics, points: { x: number; y: number }[]): void {
    if (points.length < 2) return;

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);

    // Use catmull-rom style smoothing
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const segments = 8;
      for (let t = 1; t <= segments; t++) {
        const tt = t / segments;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        const x = 0.5 * (
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3 +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + p2.x) * tt +
          2 * p1.x
        );
        const y = 0.5 * (
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3 +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + p2.y) * tt +
          2 * p1.y
        );

        graphics.lineTo(x, y);
      }
    }

    graphics.strokePath();
  }

  private blockSmoothRoadCells(): void {
    const pathPixels = this.grid.getPathPixels();
    if (pathPixels.length < 2) return;

    // Sample points along the smooth curve and block only directly overlapping cells
    const cellSize = this.grid.cellSize;
    const roadWidth = cellSize * 0.4;

    for (let i = 0; i < pathPixels.length - 1; i++) {
      const p0 = pathPixels[Math.max(0, i - 1)];
      const p1 = pathPixels[i];
      const p2 = pathPixels[Math.min(pathPixels.length - 1, i + 1)];
      const p3 = pathPixels[Math.min(pathPixels.length - 1, i + 2)];

      const segments = 4;
      for (let t = 0; t <= segments; t++) {
        const tt = t / segments;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        const x = 0.5 * (
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3 +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + p2.x) * tt +
          2 * p1.x
        );
        const y = 0.5 * (
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3 +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + p2.y) * tt +
          2 * p1.y
        );

        // Block only the cell the road actually passes through
        const { col, row } = this.grid.worldToGrid(x, y);
        if (col >= 0 && col < this.grid.cols && row >= 0 && row < this.grid.rows) {
          const cellType = this.grid.getCell(col, row);
          if (cellType === 'empty') {
            this.grid.setCell(col, row, 'path');
          }
        }
      }
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // Hover works on the background grid (half-cell resolution)
    const { col, row } = this.grid.worldToBgGrid(pointer.x, pointer.y);
    if (col === this.hoverCol && row === this.hoverRow) return;
    this.hoverCol = col;
    this.hoverRow = row;
    if (!this.hoverIndicator) return;
    if (col < 0 || col >= this.grid.cols * 2 || row < 0 || row >= this.grid.rows * 2) {
      this.hoverIndicator.setVisible(false);
      this.hoverRangeCircle?.setVisible(false);
      return;
    }

    // Don't show hover indicator when pending build is active
    if (this.pendingBuildPos) {
      this.hoverIndicator.setVisible(false);
      this.hoverRangeCircle?.setVisible(false);
      return;
    }

    // Highlight only if at least one loadout tower fits this cell
    const canPlace = this.loadoutTypes.some((t) => this.grid.canPlaceAtBg(col, row, t));
    const worldPos = this.grid.bgToWorld(col, row);
    this.hoverIndicator.setPosition(worldPos.x, worldPos.y);
    this.hoverIndicator.setVisible(true);

    if (canPlace) {
      this.hoverIndicator.setFillStyle(0xffffff, 0.1);
      this.hoverIndicator.setStrokeStyle(1, 0xffffff, 0.3);
    } else {
      this.hoverIndicator.setVisible(false);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.isGameOver) return;

    // Ignore clicks if popup was just clicked
    if (this.popupClickHandled) {
      this.popupClickHandled = false;
      return;
    }

    // Ignore clicks if popup is visible
    if (this.towerPanel.isVisible()) {
      return;
    }

    const { col, row } = this.grid.worldToBgGrid(pointer.x, pointer.y);
    const existingTower = this.findTowerAt(col, row);

    // Right-click or middle-click to cancel
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      this.cancelPendingBuild();
      this.deselectTower();
      this.deselectEnemy();
      return;
    }

    // Check if clicking on an enemy
    const clickedEnemy = this.findEnemyAt(pointer.x, pointer.y);
    if (clickedEnemy) {
      this.selectEnemy(clickedEnemy);
      return;
    }

    // If there's a pending build position, clicking anywhere cancels it
    if (this.pendingBuildPos) {
      this.cancelPendingBuild();
      return;
    }

    // Left-click on existing tower - show tower info popup
    if (existingTower) {
      this.selectedTower = existingTower;
      existingTower.showRange(true);
      const sellValue = this.economy.getSellValue(existingTower.type, existingTower.level);
      this.towerPanel.showAtCursor(pointer.x, pointer.y, 'tower', {
        type: existingTower.type,
        level: existingTower.level,
        sellValue,
      });
      return;
    }

    // Left-click on empty cell - freeze target and show build popup.
    // `col`/`row` are background-grid coordinates (half-cell resolution).
    // Which loadout towers are legal on THIS cell (path/area/tower collision
    // + sniper/roof rules)
    const allowed = this.loadoutTypes.filter((t) => this.grid.canPlaceAtBg(col, row, t));
    if (allowed.length > 0) {
      this.pendingBuildPos = { col, row };
      this.showPendingRange(col, row);
      this.towerPanel.setAvailableTypes(allowed);
      this.towerPanel.showAtCursor(pointer.x, pointer.y, 'build');
    } else {
      this.deselectTower();
    }
  }

  private showPendingRange(col: number, row: number): void {
    const worldPos = this.grid.bgToWorld(col, row);
    if (this.pendingRangeCircle) {
      this.pendingRangeCircle.setPosition(worldPos.x, worldPos.y);
      this.pendingRangeCircle.setVisible(true);
    }
  }

  private cancelPendingBuild(): void {
    this.pendingBuildPos = null;
    if (this.pendingRangeCircle) {
      this.pendingRangeCircle.setVisible(false);
    }
    if (this.selectedTower) {
      this.selectedTower.showRange(false);
      this.selectedTower = null;
    }
  }

  private findEnemyAt(x: number, y: number): Enemy | null {
    const clickRadius = 20;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.isDead()) continue;
      const dist = Math.sqrt(
        (x - enemy.position.x) ** 2 + (y - enemy.position.y) ** 2
      );
      if (dist < clickRadius) {
        return enemy;
      }
    }
    return null;
  }

  private selectEnemy(enemy: Enemy): void {
    this.selectedEnemy = enemy;
    this.showTargetSight(enemy);
  }

  private deselectEnemy(): void {
    this.selectedEnemy = null;
    this.hideTargetSight();
  }

  private showTargetSight(enemy: Enemy): void {
    if (!this.targetSight) {
      this.targetSight = this.add.graphics();
      this.targetSight.setDepth(60);
    }
    this.targetSight.setVisible(true);
    this.drawTargetSight(enemy.position.x, enemy.position.y);
  }

  private drawTargetSight(x: number, y: number): void {
    if (!this.targetSight) return;
    this.targetSight.clear();
    const size = 14;
    const gap = 4;
    this.targetSight.lineStyle(2, 0xff0000, 0.9);
    // Top-left
    this.targetSight.lineBetween(x - size, y - size, x - gap, y - size);
    this.targetSight.lineBetween(x - size, y - size, x - size, y - gap);
    // Top-right
    this.targetSight.lineBetween(x + size, y - size, x + gap, y - size);
    this.targetSight.lineBetween(x + size, y - size, x + size, y - gap);
    // Bottom-left
    this.targetSight.lineBetween(x - size, y + size, x - gap, y + size);
    this.targetSight.lineBetween(x - size, y + size, x - size, y + gap);
    // Bottom-right
    this.targetSight.lineBetween(x + size, y + size, x + gap, y + size);
    this.targetSight.lineBetween(x + size, y + size, x + size, y + gap);
  }

  private hideTargetSight(): void {
    if (this.targetSight) {
      this.targetSight.setVisible(false);
    }
  }

  private onBuildTowerSelect(type: TowerType): void {
    if (!this.pendingBuildPos) return;
    const { col, row } = this.pendingBuildPos;
    this.placeTower(col, row, type);
    this.cancelPendingBuild();
  }

  private placeTower(col: number, row: number, type: TowerType, ownerId?: string, colorHex?: string): void {
    const data = TOWER_DEFINITIONS[type];
    if (!data) return;
    // Local builds use this player's own loadout; the host validates a remote
    // player's build against THEIR loadout (shared by the lobby). Unknown or
    // empty remote loadouts are trusted — the sender already checked locally.
    const isRemote = ownerId !== undefined && ownerId !== this.myPlayerId();
    const loadout = isRemote ? this.remoteLoadouts.get(ownerId) : this.loadoutTypes;
    if (loadout && loadout.length > 0 && !loadout.includes(type)) return;
    if (!this.grid.canPlaceAtBg(col, row, type)) return;

    // Who is paying? Solo/host = self; remote command = its sender.
    const owner = ownerId ?? this.myPlayerId();

    // Guest: relay the action to the host (authoritative)
    if (this.netRole === 'guest') {
      if (!this.economy.canAfford(data.cost)) return;
      lobby.sendCommand({ k: 'place', col, row, type });
      this.hoverRangeCircle?.setVisible(false);
      return;
    }

    // Spend from the ACTING player's own pot — never shared
    if (!this.spendGold(owner, data.cost)) return;
    this.grid.placeTowerAtBg(col, row, type);
    const tower = new Tower(type, col, row);
    tower.ownerId = owner;
    tower.setPlayerColor(colorHex ?? userProfile.towerColor);
    tower.createSprite(this);
    tower.showRange(false);
    this.towers.push(tower);
    eventBus.emit('tower-placed', { towerType: type, x: col, y: row });
    if (tower.sprite) {
      this.tweens.add({ targets: tower.sprite, scaleX: 1.2, scaleY: 1.2, duration: 100, yoyo: true });
    }
    this.hoverRangeCircle?.setVisible(false);
    this.refreshOwnGoldHud();
  }

  private selectExistingTower(tower: Tower): void {
    if (this.selectedTower) this.selectedTower.showRange(false);
    this.selectedTower = tower;
    tower.showRange(true);
    const sellValue = this.economy.getSellValue(tower.type, tower.level);
    this.towerPanel.showTowerInfo(tower.type, tower.level, sellValue);
  }

  private deselectTower(): void {
    if (this.selectedTower) { this.selectedTower.showRange(false); this.selectedTower = null; }
    this.towerPanel.hide();
    this.hoverRangeCircle?.setVisible(false);
    this.cancelPendingBuild();
  }

  private onSellTower(): void {
    if (!this.selectedTower) return;
    const tower = this.selectedTower;

    // Only the owner may sell (each player funds their own towers)
    if (tower.ownerId && tower.ownerId !== this.myPlayerId()) {
      this.towerPanel.hide();
      return;
    }

    // Guest: relay to the host
    if (this.netRole === 'guest') {
      lobby.sendCommand({ k: 'sell', id: tower.id });
      this.towerPanel.hide();
      return;
    }
    this.sellTower(tower);
  }

  private sellTower(tower: Tower, actorId: string = this.myPlayerId()): void {
    if (tower.ownerId && tower.ownerId !== actorId) return; // not yours to sell
    const refund = this.economy.getSellValue(tower.type, tower.level);
    this.addGold(actorId, refund);
    this.grid.removeTowerAtBg(tower.getGridCol(), tower.getGridRow());
    tower.destroy();
    this.towers = this.towers.filter((t) => t !== tower);
    eventBus.emit('tower-sold', { towerType: tower.type, refund });
    this.deselectTower();
    this.refreshOwnGoldHud();
  }

  private onUpgradeTower(): void {
    if (!this.selectedTower || this.selectedTower.level >= MAX_TOWER_LEVEL) return;
    const tower = this.selectedTower;

    // Only the owner may upgrade (each player funds their own towers)
    if (tower.ownerId && tower.ownerId !== this.myPlayerId()) {
      this.towerPanel.hide();
      return;
    }

    // Guest: relay to the host
    if (this.netRole === 'guest') {
      lobby.sendCommand({ k: 'upgrade', id: tower.id });
      this.towerPanel.hide();
      return;
    }
    this.upgradeTower(tower);
  }

  private upgradeTower(tower: Tower, actorId: string = this.myPlayerId()): void {
    if (tower.ownerId && tower.ownerId !== actorId) return; // not yours to upgrade
    if (tower.level >= MAX_TOWER_LEVEL) return;
    const cost = this.economy.getUpgradeCost(tower.type, tower.level);
    if (!this.spendGold(actorId, cost)) return;

    const oldRange = tower.range;
    const worldPos = tower.getWorldPosition();
    tower.upgrade();
    const newRange = tower.range;

    // Hide tower's own range circle immediately
    tower.showRange(false);

    eventBus.emit('tower-upgraded', { towerType: tower.type, newLevel: tower.level });
    this.towerPanel.hide();
    this.refreshOwnGoldHud();

    // Animate range growth
    this.animateRangeGrowth(worldPos, oldRange, newRange);
  }

  private animateRangeGrowth(worldPos: { x: number; y: number }, fromRadius: number, toRadius: number): void {
    const rangeCircle = this.add.circle(worldPos.x, worldPos.y, fromRadius, 0x4CAF50, 0);
    rangeCircle.setStrokeStyle(2, 0x4CAF50, 0.6);
    rangeCircle.setDepth(48);

    // Animate radius growth
    this.tweens.add({
      targets: rangeCircle,
      scaleX: toRadius / fromRadius,
      scaleY: toRadius / fromRadius,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        // Wait 2 seconds then destroy
        this.time.delayedCall(2000, () => {
          rangeCircle.destroy();
        });
      },
    });
  }

  private findTowerAt(col: number, row: number): Tower | null {
    return this.towers.find(t => t.getGridCol() === col && t.getGridRow() === row) || null;
  }

  private updateEnemies(deltaMs: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const reachedBase = enemy.update(deltaMs);
      if (reachedBase) {
        // Clear selection if this enemy was selected
        if (this.selectedEnemy === enemy) {
          this.deselectEnemy();
        }
        // Remove BEFORE notifying: wave completion checks the live enemy list
        this.removeEnemy(enemy, i);
        eventBus.emit('enemy-reached-base', { damage: 1 });
      }
    }
  }

  private removeEnemy(enemy: Enemy, index?: number): void {
    enemy.destroy();
    this.detachEnemy(enemy, index);
  }

  /** Drop the enemy from the live list without touching its sprite. */
  private detachEnemy(enemy: Enemy, index?: number): void {
    if (index !== undefined) {
      this.enemies.splice(index, 1);
    } else {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);
    }
  }

  private updateTowerCombat(deltaMs: number): void {
    for (const tower of this.towers) {
      tower.update(deltaMs);
      if (!tower.canFire()) continue;
      const target = this.findTarget(tower);
      if (!target) continue;
      tower.fire();
      this.fireProjectile(tower, target);
    }
  }

  private findTarget(tower: Tower): TargetableEntity | null {
    // Prioritize selected enemy if in range, alive AND damageable
    // (phantoms ignore everything but upgraded snipers/archers)
    if (
      this.selectedEnemy && this.selectedEnemy.alive && !this.selectedEnemy.isDead() &&
      canDamageEnemy(tower.type, tower.level, this.selectedEnemy.data)
    ) {
      const dist = tower.position.distanceTo(this.selectedEnemy.position);
      if (dist <= tower.range) {
        return { id: this.selectedEnemy.id, position: this.selectedEnemy.position, health: this.selectedEnemy.health };
      }
    }

    const enemies = this.enemies
      .filter(e => e.alive && !e.isDead() && canDamageEnemy(tower.type, tower.level, e.data))
      .map(e => ({ id: e.id, position: e.position, health: e.health }));
    return TargetingSystem.findTarget(tower.position, tower.range, enemies, tower.targetMode);
  }

  private fireProjectile(tower: Tower, target: TargetableEntity): void {
    const towerPos = tower.getWorldPosition();
    const damage = { baseDamage: tower.damage, splashRadius: tower.splashRadius, slowFactor: tower.slowFactor, slowDuration: tower.slowDuration };
    const proj = new Projectile(tower.type, towerPos.x, towerPos.y, damage as any, target.id, Phaser.Display.Color.HexStringToColor(tower.data.color).color);
    proj.ownerId = tower.ownerId;
    proj.towerLevel = tower.level;
    proj.createSprite(this);
    this.projectiles.push(proj);
    eventBus.emit('projectile-fired', { towerType: tower.type, x: towerPos.x, y: towerPos.y });
  }

  private updateProjectiles(deltaMs: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) { proj.destroy(); this.projectiles.splice(i, 1); continue; }
      const targetEnemy = this.enemies.find(e => e.id === proj.getTargetId() && e.alive);
      const targetPos = targetEnemy ? targetEnemy.position : null;
      const reached = proj.update(deltaMs, targetPos);
      if (reached && targetEnemy && proj.hasHit(targetEnemy.position)) {
        this.applyProjectileDamage(proj, targetEnemy);
        proj.alive = false;
      } else if (!targetPos) {
        proj.alive = false;
      }
    }
  }

  private applyProjectileDamage(proj: Projectile, primaryTarget: Enemy): void {
    // Immune to this tower type, or (for phantoms) this tower can't
    // damage invisible enemies: show the immune indicator instead
    const immune =
      (primaryTarget.data.immuneTo && primaryTarget.data.immuneTo.includes(proj.getTowerType())) ||
      !canDamageEnemy(proj.getTowerType(), proj.towerLevel, primaryTarget.data);
    if (immune) {
      this.createImmuneIndicator(primaryTarget.position.x, primaryTarget.position.y);
      return;
    }
   
    // Splatter in the direction the projectile was travelling
    const dir = proj.getTravelDirection();
    this.createBloodSplatter(dir.x, dir.y, primaryTarget.position, primaryTarget.data.size, 0);

    const dmg = proj.damage;
    // The hit shoves the enemy back along the flight direction —
    // harder hits push further
    primaryTarget.applyImpact(dir.x, dir.y, 4 + Math.min(8, dmg.baseDamage / 10));
    const killed = this.healthSystem.applyDamage(
      { id: primaryTarget.id, position: primaryTarget.position, health: primaryTarget.health },
      dmg.baseDamage,
    );
    if (killed) {this.onEnemyKilled(primaryTarget, proj.ownerId);
      this.createBloodSplatter(dir.x, dir.y, primaryTarget.position, primaryTarget.data.size, 3);

    }
    if (dmg.slowFactor < 1.0) {
      primaryTarget.health.applySlow(dmg.slowFactor, dmg.slowDuration);
    }
    if (dmg.splashRadius > 0) {
      const nearbyEnemies = this.enemies
        .filter(e => e.alive && e !== primaryTarget
          && !(e.data.immuneTo && e.data.immuneTo.includes(proj.getTowerType()))
          && canDamageEnemy(proj.getTowerType(), proj.towerLevel, e.data))
        .map(e => ({ id: e.id, position: e.position, health: e.health }));
      // The blast knocks everyone in the radius away from the impact
      for (const n of nearbyEnemies) {
        const victim = this.enemies.find(e => e.id === n.id);
        if (victim) {
          victim.applyImpact(
            n.position.x - primaryTarget.position.x,
            n.position.y - primaryTarget.position.y,
            3 + Math.min(6, dmg.baseDamage / 14),
          );
        }
      }
      const splashKilled = this.healthSystem.applySplashDamage(
        primaryTarget.position.x, primaryTarget.position.y, dmg.splashRadius, dmg.baseDamage * 0.5, nearbyEnemies,
      );
      for (const k of splashKilled) this.onEnemyKilledById(k.id, proj.ownerId);
    }
  }

  /**
   * Where a drip running down an object ends: the bottom edge of the
   * wall/tree column or tower under this point, or null on open ground.
   * Shared by blood splatter and death debris.
   */
  private dripEndY(x: number, y: number): number | null {
    return this.grid.areaBottomY(x, y) ?? this.grid.towerBottomY(x, y);
  }

  /**
   * The vertical drip — shared by blood and debris: hang straight down,
   * stretch, accelerate toward the foot, then continue.
   */
  private dripDown(target: SplatterBody, targetY: number, distance: number, then: () => void): void {
    this.tweens.add({
      targets: target,
      y: targetY,
      rotation: 0,
      scaleX: 0.75,
      scaleY: 1.6,
      duration: Math.min(3500, 400 + distance * 6),
      ease: 'Power1.in',
      onComplete: then,
    });
  }

  /**
   * Death debris landing: on walls/trees/towers it shares blood's drip
   * down to the base; on open ground it bounces a little, then fades
   * out over the same 5s the blood takes.
   */
  private landDebris(
    piece: Phaser.GameObjects.Image,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    bounceCount: number,
  ): void {
    const fade = () => {
      if (!piece.active) return;
      this.tweens.add({
        targets: piece,
        alpha: 0,
        duration: 5000,
        onComplete: () => {
          if (piece.active) piece.destroy();
        },
      });
    };

    const endY = this.dripEndY(x, y);
    if (endY !== null) {
      const distance = endY - y;
      if (distance >= 4) {
        this.dripDown(piece, endY, distance, fade);
      } else {
        fade();
      }
      return;
    }

    // Open ground: bounce and roll in the direction it was already
    // travelling — it keeps moving the way it came in. Far-flung pieces
    // skitter with extra, decaying bounces before settling and fading
    const roll = 5 + Math.random() * 8;
    const rollPerBounce = roll / bounceCount;
    let hop = 3 + Math.random() * 4;
    let bounced = 0;

    const doBounce = () => {
      if (!piece.active) return;
      bounced++;
      this.tweens.add({
        targets: piece,
        x: piece.x + dirX * rollPerBounce * 0.5,
        y: piece.y + dirY * rollPerBounce * 0.5 - hop,
        angle: piece.angle + (Math.random() - 0.5) * 45,
        duration: 150,
        ease: 'Power1.out',
        onComplete: () => {
          if (!piece.active) return;
          this.tweens.add({
            targets: piece,
            x: piece.x + dirX * rollPerBounce * 0.5,
            y: piece.y + dirY * rollPerBounce * 0.5 + hop,
            angle: piece.angle + (Math.random() - 0.5) * 30,
            duration: 190,
            ease: 'Power1.in',
            onComplete: () => {
              if (!piece.active) return;
              if (bounced < bounceCount) {
                hop *= 0.55; // each extra bounce decays
                doBounce();
              } else {
                fade();
              }
            },
          });
        },
      });
    };
    doBounce();
  }

  private createBloodSplatter(dirX: number, dirY: number, hitPos: Position, enemySize: number, bloodSize: number): void {
    // Base angle of the projectile's travel direction
    const hitAngle = Math.atan2(dirY, dirX);

    // Number of particles
    const particleCount = 6 + (bloodSize * 4);

    /**
     * Landing sequence: on an object, run down to its base → spread into
     * a pool there → dry dark and fade out (slowly, so splatters linger).
     * On open ground, dry in place.
     */
    const settle = (particle: Phaser.GameObjects.Arc, x: number, y: number, fadeMs: number): void => {
      const dry = () => {
        if (!particle.active) return;
        particle.setFillStyle(0x4a0000, 0.8);
        this.tweens.add({
          targets: particle,
          alpha: 0,
          duration: fadeMs,
          onComplete: () => {
            if (particle.active) particle.destroy();
          },
        });
      };

      // Every landing ends in an oval pool, slightly different per splat.
      // The vertical-drip → pool change is instant (no morph); a few
      // pixel-sized drips scatter in an oval around it, then all dry.
      const formPool = (poolX: number, poolY: number) => {
        if (!particle.active) return;

        // Instant: snap straight out of the drip into the pool, on the
        // ground layer (depth 0 — under walls, tiles and everything else)
        const poolSX = 1.35 + Math.random() * 0.45;
        const poolSY = 0.55 + Math.random() * 0.15;
        particle.setDepth(0);
        particle.setPosition(poolX, poolY);
        particle.rotation = 0;
        particle.setScale(poolSX, poolSY);

        // Ejecta: irregular angles and staggered distances so the spray
        // reads as an explosion flung out of the pool — each drop streaked
        // along its flight path and popping outward. Sized to never render
        // under 2x2 (radius 1.5+ x scaleY 0.7+ = 2.1px minimum).
        const rx = particle.radius * poolSX * 2.2;
        const ry = particle.radius * poolSY * 1.4;
        const dropCount = 2 + Math.floor(Math.random() * 3);
        const drops: Phaser.GameObjects.Arc[] = [];
        for (let d = 0; d < dropCount; d++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.9 + Math.random() * 1.1; // 0.9-2.0x: close and flung
          const startX = poolX + Math.cos(angle) * rx * 0.4;
          const startY = poolY + Math.sin(angle) * ry * 0.4;
          const endX = poolX + Math.cos(angle) * rx * dist;
          const endY = poolY + Math.sin(angle) * ry * dist;
          const drop = this.add.circle(
            startX, startY,
            1.5 + Math.random() * 0.7,
            0xcc0000,
            particle.alpha,
          );
          drop.setDepth(0);
          drop.rotation = Math.atan2(endY - startY, endX - startX);
          drop.setScale(1.5 + Math.random() * 0.6, 0.7 + Math.random() * 0.15);
          this.tweens.add({
            targets: drop,
            x: endX,
            y: endY,
            duration: 160 + Math.random() * 100,
            ease: 'Power3.out',
          });
          drops.push(drop);
        }

        // Let the fresh pool read for a beat, then dry together
        this.time.delayedCall(300, () => {
          dry();
          for (const drop of drops) {
            if (!drop.active) continue;
            drop.setFillStyle(0x4a0000, 0.8);
            this.tweens.add({
              targets: drop,
              alpha: 0,
              duration: fadeMs * (0.6 + Math.random() * 0.4),
              onComplete: () => {
                if (drop.active) drop.destroy();
              },
            });
          }
        });
      };

      const endY = this.dripEndY(x, y);
      if (endY === null) {
        // Open ground: drip vertical for a moment just before landing,
        // then end in a pool where it stops
        const run = 10 + Math.random() * 26;
        this.dripDown(particle, y + run, run, () => {
          if (particle.active) formPool(x, y + run);
        });
        return;
      }

      // Small particles hitting an object skip the drip/pool entirely —
      // they leave a scatter of speckles on its face that dry in place
      if (particle.radius < 3) {
        const dots: Phaser.GameObjects.Arc[] = [];
        const speckCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < speckCount; i++) {
          const dot = this.add.circle(
            x + (Math.random() - 0.5) * 10,
            y + (Math.random() - 0.5) * 10,
            1 + Math.random() * 0.6,
            0xcc0000,
            particle.alpha,
          );
          dot.setDepth(11); // on the object's face, under enemies (14)
          dots.push(dot);
        }
        this.time.delayedCall(300, () => {
          dry();
          for (const dot of dots) {
            if (!dot.active) continue;
            dot.setFillStyle(0x4a0000, 0.8);
            this.tweens.add({
              targets: dot,
              alpha: 0,
              duration: fadeMs * (0.6 + Math.random() * 0.4),
              onComplete: () => {
                if (dot.active) dot.destroy();
              },
            });
          }
        });
        return;
      }

      const distance = endY - y;
      if (distance < 4) {
        // Already at the object's base — pool at its foot
        formPool(x, endY + 2);
        return;
      }

      // Run down the whole object, then pool at the foot
      this.dripDown(particle, endY, distance, () => formPool(x, endY + 2));
    };

    for (let i = 0; i < particleCount; i++) {
      const size = (2 + bloodSize) + Math.random() * 2;
      const particle = this.add.circle(
        hitPos.x,
        hitPos.y,
        size,
        0xcc0000,
        1,
      );
      particle.setDepth(11);

      // Random spread around the projectile's travel direction
      const angle = hitAngle + (Math.random() - 0.5) * 1.5;
      const speed = 35 + Math.random() * 55;
      const targetX = hitPos.x + Math.cos(angle) * speed;
      const targetY = hitPos.y + Math.sin(angle) * speed;

      // Born circular, stretched into an oval along the flight direction
      particle.rotation = angle;
      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0.6,
        scaleX: 1.9 + Math.random() * 0.7,
        scaleY: 0.55 + Math.random() * 0.25,
        duration: 300 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => {
          if (particle.active) settle(particle, targetX, targetY, 5000);
        },
      });

      // Also spawn exit blood (opposite direction, fewer particles)
      if (i < 4) {
        const exitAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        const exitSpeed = 18 + Math.random() * 32;
        const exitTargetX = hitPos.x + Math.cos(exitAngle) * exitSpeed;
        const exitTargetY = hitPos.y + Math.sin(exitAngle) * exitSpeed;
        const exitParticle = this.add.circle(
          hitPos.x,
          hitPos.y,
          (1 + bloodSize) + Math.random() * (2 + bloodSize),
          0xcc0000,
          1,
        );
        exitParticle.setDepth(11);

        exitParticle.rotation = exitAngle;
        this.tweens.add({
          targets: exitParticle,
          x: exitTargetX,
          y: exitTargetY,
          alpha: 0.4,
          scaleX: 1.7 + Math.random() * 0.6,
          scaleY: 0.55 + Math.random() * 0.2,
          duration: 250,
          ease: 'Power2',
          onComplete: () => {
            if (exitParticle.active) settle(exitParticle, exitTargetX, exitTargetY, 4000);
          },
        });
      }
    }

    // Fine spray: pixel-sized particles from the very start of the
    // lifecycle — born at the hit, they fly, drip and pool like the rest
    const speckCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < speckCount; i++) {
      const angle = hitAngle + (Math.random() - 0.5) * 2.4; // wider spread
      const speed = 25 + Math.random() * 60;
      const targetX = hitPos.x + Math.cos(angle) * speed;
      const targetY = hitPos.y + Math.sin(angle) * speed;
      const speck = this.add.circle(hitPos.x, hitPos.y, 1.85 + Math.random() * 0.5, 0xcc0000, 1);
      speck.setDepth(11);
      speck.rotation = angle;
      this.tweens.add({
        targets: speck,
        x: targetX,
        y: targetY,
        alpha: 0.6,
        scaleX: 1.6 + Math.random() * 0.8,
        scaleY: 0.6 + Math.random() * 0.3,
        duration: 260 + Math.random() * 240,
        ease: 'Power2',
        onComplete: () => {
          if (speck.active) settle(speck, targetX, targetY, 3500);
        },
      });
    }
  }

  private createImmuneIndicator(x: number, y: number): void {
    const text = this.add.text(x, y - 20, 'IMMUNE', {
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy(),
    });
  }

  private onEnemyKilled(enemy: Enemy, ownerId?: string | null): void {
    // Guard: a kill must only be processed once (damage systems can
    // report the same enemy through multiple paths in one frame).
    if (!enemy.alive) return;
    enemy.alive = false;

    // Clear selection if this enemy was selected
    if (this.selectedEnemy === enemy) {
      this.deselectEnemy();
    }
    const reward = enemy.data.reward;
    const { x, y } = enemy.position;
    this.createDeathEffect(x, y, enemy.data.color);

    // Detach from the list immediately (wave completion checks it) —
    // each death variant owns the corpse sprite from here on
    this.detachEnemy(enemy);
    enemy.healthBar?.setVisible(false);
    enemy.healthBarBg?.setVisible(false);

    // Three death animations, picked at random: bleed out, tip over
    // and explode, or the plain sprite burst
    const roll = Math.random();
    if (roll < 1 / 3) {
      this.deathBleedOut(enemy);
    } else if (roll < 2 / 3) {
      this.deathTipOver(enemy);
    } else {
      this.explodeEnemySprite(enemy);
      enemy.destroy();
    }

    eventBus.emit('enemy-killed', { enemyType: enemy.type, reward, x, y, ownerId: ownerId ?? undefined });
  }

  private onEnemyKilledById(id: string, ownerId?: string | null): void {
    const enemy = this.enemies.find(e => e.id === id && e.alive);
    if (enemy) this.onEnemyKilled(enemy, ownerId);
  }

  /**
   * Death variant: the corpse slides a little off the road, shrinks in
   * height, then bleeds out — blood drips from its center into a pool
   * that dries like every other splatter.
   */
  /**
   * Solid thing a dying corpse's glide bumps into here — anything that
   * isn't ground: tree/wall cells, towers and other enemies — as an
   * obstacle center to bounce off, or null when the way is clear.
   */
  private glideObstacleAt(x: number, y: number, selfSize: number): { cx: number; cy: number } | null {
    const { col, row } = this.grid.worldToBgGrid(x, y);
    const area = this.grid.getArea(col, row);
    if (area === 'tree' || area === 'wall') {
      const cell = this.grid.bgToWorld(col, row);
      return { cx: cell.x, cy: cell.y };
    }
    for (const t of this.towers) {
      if (Math.hypot(t.position.x - x, t.position.y - y) < CELL_SIZE * 0.5 + selfSize * 0.4) {
        return { cx: t.position.x, cy: t.position.y };
      }
    }
    for (const e of this.enemies) {
      if (!e.alive || e.isDead()) continue;
      if (Math.hypot(e.position.x - x, e.position.y - y) < e.data.size + selfSize * 0.5) {
        return { cx: e.position.x, cy: e.position.y };
      }
    }
    return null;
  }

  /**
   * Once the corpse has glided to rest, running enemies shove it around:
   * contact pushes it away, the skid bounces off anything that isn't
   * ground, and friction brings it to a stop. Stops when the fade begins.
   */
  private enableCorpsePush(enemy: Enemy, sprite: Phaser.GameObjects.Image): void {
    const size = enemy.data.size;
    const vel = { x: 0, y: 0 };
    let stopping = false;

    const event = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (stopping || !sprite.active) {
          event.remove();
          return;
        }

        // Running enemies shove the corpse out of their way
        for (const e of this.enemies) {
          if (!e.alive || e.isDead()) continue;
          const dx = sprite.x - e.position.x;
          const dy = sprite.y - e.position.y;
          const dist = Math.hypot(dx, dy);
          const reach = e.data.size + size * 0.5;
          if (dist < reach && dist > 0.01) {
            const nx = dx / dist;
            const ny = dy / dist;
            const depth = Math.min(reach - dist, 3);
            sprite.x += nx * depth;
            sprite.y += ny * depth;
            vel.x += nx * depth * 0.7;
            vel.y += ny * depth * 0.7;
          }
        }

        // Cap the skid speed, then move — bouncing off non-ground objects
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > 4) {
          vel.x = (vel.x / speed) * 4;
          vel.y = (vel.y / speed) * 4;
        }
        if (Math.hypot(vel.x, vel.y) > 0.02) {
          const nx = sprite.x + vel.x;
          const ny = sprite.y + vel.y;
          const obstacle = this.glideObstacleAt(nx, ny, size);
          if (obstacle) {
            // Reflect off the surface with a little damping
            const ox = nx - obstacle.cx;
            const oy = ny - obstacle.cy;
            const ol = Math.hypot(ox, oy) || 1;
            const nX = ox / ol;
            const nY = oy / ol;
            const dot = vel.x * nX + vel.y * nY;
            vel.x = (vel.x - 2 * dot * nX) * 0.7;
            vel.y = (vel.y - 2 * dot * nY) * 0.7;
          } else {
            sprite.x = nx;
            sprite.y = ny;
          }
          // Friction — the skid dies out on its own
          vel.x *= 0.9;
          vel.y *= 0.9;
        }
      },
    });

    // Rigs stop the moment the corpse starts fading (pool spread = 1400ms)
    this.time.delayedCall(1450, () => {
      stopping = true;
    });
  }

  /**
   * March forward along dir for up to `distance` px, reflecting off
   * trees, walls and other enemies — the polyline a dying corpse glides.
   */
  private buildGlidePath(
    startX: number,
    startY: number,
    dir: { x: number; y: number },
    distance: number,
    selfSize: number,
  ): { x: number; y: number }[] {
    const pts = [{ x: startX, y: startY }];
    let px = startX;
    let py = startY;
    let dx = dir.x;
    let dy = dir.y;
    let remaining = distance;
    const step = 3;
    let bounces = 0;

    while (remaining > 0 && bounces <= 3) {
      let traveled = 0;
      let obstacle: { cx: number; cy: number } | null = null;
      while (traveled < remaining) {
        const nx = px + dx * step;
        const ny = py + dy * step;
        obstacle = this.glideObstacleAt(nx, ny, selfSize);
        if (obstacle) break;
        px = nx;
        py = ny;
        traveled += step;
      }
      remaining -= traveled;
      if (obstacle && remaining > 6) {
        pts.push({ x: px, y: py });
        // Reflect off the surface that points back at us
        const nx = px - obstacle.cx;
        const ny = py - obstacle.cy;
        const nl = Math.hypot(nx, ny) || 1;
        const nX = nx / nl;
        const nY = ny / nl;
        const dot = dx * nX + dy * nY;
        dx = dx - 2 * dot * nX;
        dy = dy - 2 * dot * nY;
        // Hop past the obstacle so the next step doesn't re-hit it
        px += dx * step * 2;
        py += dy * step * 2;
        remaining -= step * 2;
        bounces++;
      } else {
        px += dx * remaining;
        py += dy * remaining;
        remaining = 0;
      }
    }
    const end = { x: px, y: py };
    const last = pts[pts.length - 1];
    if (Math.hypot(end.x - last.x, end.y - last.y) > 1) pts.push(end);
    return pts;
  }

  private deathBleedOut(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) {
      enemy.destroy();
      return;
    }
    enemy.stopInvisibilityPulse();
    // Above the blood (11) and its pools (11 -> 0) for the whole death,
    // so the corpse always lies on top of its own bleed pool
    sprite.setDepth(12);

    // Glide on in the direction it was travelling when shot — bouncing
    // off trees, walls and other enemies — flipping as it goes
    const startDir = enemy.currentDirection();
    const jitter = (Math.random() - 0.5) * 0.3;
    const cosJ = Math.cos(jitter);
    const sinJ = Math.sin(jitter);
    const dir = {
      x: startDir.x * cosJ - startDir.y * sinJ,
      y: startDir.x * sinJ + startDir.y * cosJ,
    };
    const slide = 40 + Math.random() * 30;
    const flip = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6);
    const slideMs = 700;
    const pts = this.buildGlidePath(sprite.x, sprite.y, dir, slide, enemy.data.size);

    // Arc-length position along the (possibly bouncing) path at t (0..1)
    const segLens: number[] = [];
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segLens.push(l);
      totalLen += l;
    }
    const glidePath = (t: number): { x: number; y: number } => {
      let dist = t * totalLen;
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= segLens[i] || i === segLens.length - 1) {
          const u = segLens[i] > 0 ? Math.min(dist / segLens[i], 1) : 0;
          return {
            x: pts[i].x + (pts[i + 1].x - pts[i].x) * u,
            y: pts[i].y + (pts[i + 1].y - pts[i].y) * u,
          };
        }
        dist -= segLens[i];
      }
      return pts[pts.length - 1];
    };

    // Bleed from the very start: the full pattern flies out of the
    // corpse while it is still gliding (frames slow as it goes)
    this.createBloodSplatter(dir.x, dir.y, new Position(sprite.x, sprite.y), enemy.data.size, 1);

    // Small splatter spurts out of the sprite the whole time it dies
    const spurtCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spurtCount; i++) {
      this.time.delayedCall(i * 120 + Math.random() * 60, () => {
        if (sprite.active) this.bloodSpurt(sprite.x, sprite.y);
      });
    }

    // Blood dots mark the drag along the glide path — scheduled at the
    // wall-clock time the eased glide actually reaches each point
    const timeAt = (t: number): number => slideMs * (1 - Math.pow(1 - t, 1 / 5)); // inverse of Power4.out
    const traceCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < traceCount; i++) {
      const t = (i + 1) / (traceCount + 1);
      this.time.delayedCall(timeAt(t), () => {
        const pt = glidePath(t);
        const dot = this.add.circle(
          pt.x + (Math.random() - 0.5) * 4,
          pt.y + (Math.random() - 0.5) * 4,
          1.5 + Math.random() * 1.5,
          0xcc0000,
          0.85,
        );
        dot.setDepth(11);
        // Dry like the rest of the blood
        this.time.delayedCall(400, () => {
          if (!dot.active) return;
          dot.setDepth(0);
          dot.setFillStyle(0x4a0000, 0.8);
          this.tweens.add({
            targets: dot,
            alpha: 0,
            duration: 5000,
            onComplete: () => {
              if (dot.active) dot.destroy();
            },
          });
        });
      });
    }

    // One continuous glide that slows down more and more as it goes:
    // eased progress mapped along the two-leg (veering) path
    const prog = { t: 0 };

    // The walk-cycle tiles slow down in step with the glide...
    if (sprite.anims.isPlaying) {
      this.tweens.add({
        targets: sprite.anims,
        timeScale: 0,
        duration: slideMs,
        ease: 'Power4.out',
      });
    }

    this.tweens.add({
      targets: prog,
      t: 1,
      duration: slideMs,
      ease: 'Power4.out', // slows down fast — visibly at rest well before the fade
      onUpdate: () => {
        if (!sprite.active) return;
        const pt = glidePath(prog.t);
        sprite.setPosition(pt.x, pt.y);
        sprite.angle = flip * prog.t;
      },
      onComplete: () => {
        if (!sprite.active) {
          enemy.destroy();
          return;
        }
        // The animation has stopped: after lying still for a second it
        // bleeds into a blood pool — no splatter, just drips and a pool
        sprite.anims.stop();
        this.time.delayedCall(1000, () => {
          if (sprite.active) {
            this.bleedOutPool(sprite.x, sprite.y, enemy.data.size);
          }
        });
        // From here running enemies can shove the corpse around
        this.enableCorpsePush(enemy, sprite);
        // The corpse fades out alongside the blood — the same
        // 5s fade, starting as the pool begins to dry
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          duration: 5000,
          delay: 2400, // still second (1000) + pool spread (1400)
          onComplete: () => enemy.destroy(),
        });
      },
    });
  }

  /** Small spurt of blood spraying out from the dying sprite. */
  private bloodSpurt(x: number, y: number): void {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 14;
      const dot = this.add.circle(x, y, 1.2 + Math.random() * 1.2, 0xcc0000, 0.95);
      dot.setDepth(11);
      dot.rotation = angle;
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scaleX: 1.8,
        scaleY: 0.65,
        alpha: 0.5,
        duration: 180 + Math.random() * 140,
        ease: 'Power2.out',
        onComplete: () => {
          if (!dot.active) return;
          dot.setDepth(0);
          dot.setFillStyle(0x4a0000, 0.8);
          this.tweens.add({
            targets: dot,
            alpha: 0,
            duration: 4000,
            onComplete: () => {
              if (dot.active) dot.destroy();
            },
          });
        },
      });
    }
  }


  /** Blood drips out from under the corpse into a spreading pool that dries. */
  private bleedOutPool(x: number, y: number, corpseSize: number): void {
    const poolY = y + corpseSize * 0.5;
    const pool = this.add.circle(x, poolY, 10 + Math.random() * 6, 0xcc0000, 1);
    pool.setDepth(11);
    pool.setScale(0.1);

    // Drips fall from the corpse's center into the pool
    const dripCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < dripCount; i++) {
      this.time.delayedCall(i * 130 + Math.random() * 90, () => {
        if (!pool.active) return;
        const drip = this.add.circle(
          x + (Math.random() - 0.5) * 8,
          y,
          1.5 + Math.random() * 0.8,
          0xcc0000,
          0.9,
        );
        drip.setDepth(11);
        this.tweens.add({
          targets: drip,
          y: poolY,
          duration: 160 + Math.random() * 140,
          ease: 'Power1.in',
          onComplete: () => {
            if (drip.active) drip.destroy();
          },
        });
      });
    }

    // The pool spreads into the familiar oval, then dries like blood
    this.tweens.add({
      targets: pool,
      scaleX: 1.4 + Math.random() * 0.4,
      scaleY: 0.55 + Math.random() * 0.15,
      duration: 1400,
      ease: 'Power2.out',
      onComplete: () => {
        if (!pool.active) return;
        pool.setDepth(0);
        pool.setFillStyle(0x4a0000, 0.8);
        this.tweens.add({
          targets: pool,
          alpha: 0,
          duration: 5000,
          onComplete: () => {
            if (pool.active) pool.destroy();
          },
        });
      },
    });
  }

  /**
   * Death variant: the corpse slides off the road, tips over ~100
   * degrees, then explodes and splatters like the usual death.
   */
  private deathTipOver(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) {
      enemy.destroy();
      return;
    }
    enemy.stopInvisibilityPulse();

    const dir = Math.random() * Math.PI * 2;
    const slide = 8 + Math.random() * 10;
    const fall = (Math.random() < 0.5 ? -1 : 1) * (75 + Math.random() * 70); // random way and angle

    // 1. slide a bit off the road
    this.tweens.add({
      targets: sprite,
      x: sprite.x + Math.cos(dir) * slide,
      y: sprite.y + Math.sin(dir) * slide,
      duration: 280,
      ease: 'Power1.out',
      onComplete: () => {
        if (!sprite.active) {
          enemy.destroy();
          return;
        }
        // 2. tip over
        this.tweens.add({
          targets: sprite,
          angle: fall,
          duration: 180,
          ease: 'Power1.in',
          onComplete: () => {
            if (!sprite.active) {
              enemy.destroy();
              return;
            }
            // 3. explode and splatter like the usual death
            this.createBloodSplatter(
              0, 1, new Position(sprite.x, sprite.y), enemy.data.size, 3,
            );
            this.explodeEnemySprite(enemy);
            enemy.destroy();
          },
        });
      },
    });
  }

  /**
   * Death explosion: cut the enemy's current sprite frame into a 3x3
   * grid of shards (added as sub-frames of its texture) and fling them
   * outward with spin — the sprite bursts apart where it stood.
   */
  private explodeEnemySprite(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) return;
    const tex = this.textures.get(sprite.texture.key);
    if (!tex) return;

    const src = sprite.frame;
    const COLS = 3;
    const ROWS = 3;
    const pw = Math.max(2, Math.floor(src.width / COLS));
    const ph = Math.max(2, Math.floor(src.height / ROWS));
    const dispScaleX = sprite.displayWidth / src.width;
    const dispScaleY = sprite.displayHeight / src.height;
    const rot = sprite.rotation; // tipped-over corpses burst from their pose
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const alpha = Math.max(sprite.alpha, 0.5); // phantoms still show their burst

    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const w = gx === COLS - 1 ? src.width - pw * gx : pw;
        const h = gy === ROWS - 1 ? src.height - ph * gy : ph;
        const sx = src.cutX + gx * pw;
        const sy = src.cutY + gy * ph;
        const shardName = `shard_${sx}_${sy}_${w}_${h}`;
        if (!tex.has(shardName)) {
          tex.add(shardName, src.sourceIndex, sx, sy, w, h);
        }

        const ox = (gx * pw + w / 2) * dispScaleX - sprite.displayWidth / 2;
        const oy = (gy * ph + h / 2) * dispScaleY - sprite.displayHeight / 2;
        const piece = this.add.image(
          sprite.x + ox * cosR - oy * sinR,
          sprite.y + ox * sinR + oy * cosR,
          sprite.texture.key,
          shardName,
        );
        piece.rotation = rot;
        piece.setDepth(16); // above blood (11) and projectiles (15)
        piece.setAlpha(alpha);

        // Fling outward with a slight direction tweak and widely varied
        // speed and length — most pieces barely scatter, but occasionally
        // one flies much further and skitters with extra bounces
        const longShot = Math.random() < 0.01; // ~1 in 100
        const rx = piece.x - sprite.x;
        const ry = piece.y - sprite.y;
        const ang = Math.atan2(ry, rx) + (Math.random() - 0.5) * 0.7;
        const dirX = Math.cos(ang);
        const dirY = Math.sin(ang);
        const dist = longShot
          ? 90 + Math.random() * 80          // 90-170px: the occasional far fling
          : 10 + Math.random() * Math.random() * 70; // 10-80, skewed short
        const duration = longShot
          ? 900 + Math.random() * 600        // readable flight for the far ones
          : 400 + Math.random() * 800;
        const bounces = longShot ? 2 + Math.floor(Math.random() * 2) : 1;
        this.tweens.add({
          targets: piece,
          x: piece.x + dirX * dist,
          y: piece.y + dirY * dist + 8 + Math.random() * 14,
          angle: piece.angle + (Math.random() - 0.5) * 720,
          duration,
          ease: 'Power2.out',
          onComplete: () => {
            if (!piece.active) return;
            // Lands through the shared pipeline: glide/drip down walls,
            // trees and towers like blood; on ground, bounce and roll
            // along the direction it was flying in
            this.landDebris(piece, piece.x, piece.y, dirX, dirY, bounces);
          },
        });
      }
    }
  }

  private createDeathEffect(x: number, y: number, color: string): void {
    const particles = this.add.circle(x, y, 4, Phaser.Display.Color.HexStringToColor(color).color);
    this.tweens.add({
      targets: particles, alpha: 0, scaleX: 2, scaleY: 2, duration: 300,
      onComplete: () => particles.destroy(),
    });
  }

  private spawnEnemy(type: EnemyType): void {
    const path = this.grid.getPathPixels();
    const enemy = new Enemy(type, path);
    enemy.createSprite(this);
    this.enemies.push(enemy);
    this.enemiesSpawnedInWave++;
  }

  private startNextWave(): void {
    if (this.isGameOver) return;
    // Guest: ask the host to start the wave
    if (this.netRole === 'guest') {
      lobby.sendCommand({ k: 'wave' });
      return;
    }
    this.enemiesSpawnedInWave = 0;
    this.waveManager.startWave();
    this.waveIndicator.showStartButton(false);
    this.waveIndicator.showCountdown(false);
    this.waveIndicator.setBonusText('');
    this.hud.setWave(this.waveManager.getWaveNumber(), this.waveManager.getTotalWaves());
  }

  private startWaveEarly(actorId: string = this.myPlayerId()): void {
    if (this.isGameOver) return;
    // Guest: ask the host to start early
    if (this.netRole === 'guest') {
      lobby.sendCommand({ k: 'early' });
      return;
    }
    const bonus = this.waveManager.startWaveEarly();
    if (bonus > 0) {
      // Early-start bonus goes to whoever triggered it
      this.addGold(actorId, bonus);
      this.refreshOwnGoldHud();
      this.startNextWave();
    }
  }

  private checkWaveComplete(): void {
    if (!this.waveManager.isWaveActive() || this.isGameOver) return;
    // Finish only when every enemy of the wave has spawned AND every enemy
    // has been resolved (killed or entered the base) — i.e. the live enemy
    // list is empty. Never trust a running counter for this.
    const resolved = isWaveResolved({
      spawned: this.enemiesSpawnedInWave,
      total: this.waveManager.getTotalEnemiesInWave(),
      remainingEnemies: this.enemies.length,
    });
    if (!resolved) return;

    // Shared wave-clear bonus: each player gets their own +25
    if (this.playerEcon) this.playerEcon.addAll(25);
    else this.economy.earn(25);
    this.refreshOwnGoldHud();

    this.waveManager.completeWave();
    if (this.waveManager.isComplete()) {
      this.gameOver(true);
    } else {
      this.waveIndicator.showStartButton(true);
      this.waveIndicator.setWave(this.waveManager.getWaveNumber(), this.waveManager.getTotalWaves());
    }
  }

  private gameOver(victory: boolean): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    // Multiplayer: tell guests the final status, then leave the room
    if (this.netRole === 'host') {
      this.sendSnapshot(victory ? 'won' : 'lost');
    }

    // Save progress + award coins on victory (solo, host, and guests alike)
    if (victory) {
      const firstCompletion = !userProfile.progress.completed.includes(this.currentLevelId);
      this.saveLevelProgress(this.currentLevelId);
      void userProfile.completeLevel(this.currentLevelId, COINS_PER_LEVEL_WIN).catch(() => undefined);
      this.scene.start('GameOverScene', {
        victory, score: this.score, wave: this.finalWaveNumber(),
        levelId: this.currentLevelId, firstCompletion,
      });
      return;
    }

    this.scene.start('GameOverScene', { victory, score: this.score, wave: this.finalWaveNumber(), levelId: this.currentLevelId });
  }

  /** Guests mirror the host's wave number; hosts/solo use the wave manager. */
  private finalWaveNumber(): number {
    return this.netRole === 'guest' ? this.guestWaveNumber : this.waveManager.getWaveNumber();
  }

  private saveLevelProgress(levelId: number): void {
    const saved = localStorage.getItem('towerDefense_progress');
    const data = saved ? JSON.parse(saved) : { unlocked: [1], completed: [] };
    
    if (!data.completed.includes(levelId)) {
      data.completed.push(levelId);
    }
    
    // Unlock neighbors
    const neighbors = this.getNeighbors(levelId);
    neighbors.forEach(id => {
      if (!data.unlocked.includes(id)) {
        data.unlocked.push(id);
      }
    });
    
    localStorage.setItem('towerDefense_progress', JSON.stringify(data));
  }

  private getNeighbors(levelId: number): number[] {
    const neighbors: number[] = [];
    if (levelId > 1) neighbors.push(levelId - 1);
    if (levelId < 5) neighbors.push(levelId + 1);
    if (levelId === 1) neighbors.push(3);
    if (levelId === 2) neighbors.push(4);
    if (levelId === 3) neighbors.push(1, 5);
    if (levelId === 4) neighbors.push(2, 5);
    if (levelId === 5) neighbors.push(3, 4);
    return [...new Set(neighbors)];
  }
}
