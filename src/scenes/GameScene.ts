import Phaser from 'phaser';
import type { TowerType, EnemyType, TargetMode, MapData, Difficulty } from '../types';
import { TARGET_MODES } from '../types';
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
import { TOWER_DEFINITIONS, MAX_TOWER_LEVEL, DEFAULT_TOWER_LIMITS, BASIC_TOWERS, farmIncome, beaconFireRateBuff, ninjaThrowProfile, type NinjaThrow } from '../data/towers';
import { userProfile } from '../state/UserProfile';
import { lobby } from '../ui/overlay/lobbyScreen';
import type { NetSnapshot, NetCommand, NetStatus, DeathVariant } from '../../shared/protocol';
import { CELL_SIZE, STARTING_LIVES, COLORS, DEV_MODE, STARTING_GOLD, GRID_OFFSET_Y, COINS_PER_LEVEL_WIN, livesForDifficulty } from '../config/constants';
import { eventBus } from '../utils/EventBus';
import { bindGameAudio, playSfx, startGameMusic, stopGameMusic } from '../audio/GameAudio';
import { isWaveResolved } from '../utils/waveCompletion';
import { cachedServerLevel } from '../data/serverLevels';
import { selectWaves } from '../data/LevelLoader';
import { canDamageEnemy, canNinjaThrowHit } from '../utils/damageRules';
import { DeathEffects, deathSplatterTier } from '../systems/DeathEffects';
import { NinjaCombat, NINJA_SUMMON_CAP, NINJA_THROW_AMMO, NINJA_LEVEL_TINTS, NINJA_LEASH, NINJA_THROW_RANGE, NINJA_THROW_COOLDOWN_MS, NINJA_HIT_COOLDOWN_MS, NINJA_MELEE_HURT, CONTACT_CD_MS, MELEE_IMPULSE } from '../systems/NinjaCombat';
import { NetSyncManager } from '../systems/NetSyncManager';
import { MapRenderer } from '../systems/MapRenderer';
import { TowerManager } from '../systems/TowerManager';




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
  /** Difficulty this match runs at (selector choice or the level's own). */
  private currentDifficulty: Difficulty | undefined;
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
  /** Recent splatter timestamps — thins the fine spray in busy fights. */
  private recentSplats: number[] = [];
  private deathFx!: DeathEffects;
  private ninjaCombat!: NinjaCombat;
  private netSync!: NetSyncManager;
  private mapRenderer!: MapRenderer;
  private towerMgr!: TowerManager;
  /** Corpse debris on the ground; living enemies kick it as they walk past. */
  private restingDebris: { img: Phaser.GameObjects.Image; cooldown: number }[] = [];
  /** Per-level background tile loading (see drawBackgroundTiles). */
  private bgTileEpoch: number = 0;
  private bgTileLoadActive: boolean = false;
  private bgTilesAttempted = new Set<string>();
  /** Per-player gold: players never share economics (see PlayerEconomy). */
  private playerEcon: PlayerEconomy | null = null;
  private guestEnemyTargets = new Map<string, { x: number; y: number }>();
  private guestProjectiles = new Map<string, { img: Phaser.GameObjects.Image; tx: number; ty: number; type: string; shrapnel: boolean }>();

  constructor() {
    super({ key: 'GameScene' });
  }

  create(data: { levelId?: number; netRole?: 'host' | 'guest'; map?: MapData; difficulty?: Difficulty }): void {
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    this.resetState();

    // Per-level background tile loading state
    this.mapRenderer.reset();

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
    if (DEV_MODE) {
      // In development every tower is available
      this.loadoutTypes = Object.keys(TOWER_DEFINITIONS) as TowerType[];
    } else {
      this.loadoutTypes = userProfile.loadout.filter((t): t is TowerType => t in TOWER_DEFINITIONS);
      if (this.loadoutTypes.length === 0) {
        this.loadoutTypes = ['arrow', 'cannon', 'frost'];
      }
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
    // Server-saved levels arrive as data.map (or from the fetch cache,
    // so PLAY AGAIN works without a second download)
    const baseMap = data.map
      ?? (mapIndex >= 0 ? MAP_DEFINITIONS[mapIndex] : cachedServerLevel(levelId) ?? MAP_DEFINITIONS[0]);
    // The level selector's difficulty choice overrides the level's own;
    // shallow-clone so the shared catalog entry is never mutated.
    // (Multiplayer guests never pass one — both peers then agree on the
    // authored difficulty.)
    this.currentDifficulty = data.difficulty ?? baseMap.difficulty;
    const mapData = data.difficulty && data.difficulty !== baseMap.difficulty
      ? { ...baseMap, difficulty: data.difficulty }
      : baseMap;

    this.grid = new Grid(mapData);
    this.blockSmoothRoadCells();
    this.pathfinding = new Pathfinding(this.grid);

    // Per-difficulty wave set first, then the level's own waves, then
    // the built-in defaults; dev demo keeps its special set
    const waves = selectWaves(mapData, mapData.difficulty);
    this.waveManager = new WaveManager(waves);

    // Starting gold comes from the level JSON (default 500); multiplayer
    // splits it evenly between the players (rounded up)
    const playerCount = this.netRole !== null ? Math.max(1, lobby.room?.players.length ?? 1) : 1;
    const startingGold = Math.ceil((mapData.startGold ?? STARTING_GOLD) / playerCount);
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

    this.waveManager.onSpawnEnemy = (spawn) => this.spawnEnemy(spawn.enemyType, spawn);

    // Multiplayer: wire lobby net handlers
    this.setupNetHandlers();

    // Wave 1 waits behind the same countdown + start button as the
    // later waves (host/solo; guests wait for snapshots)
    if (this.netRole !== 'guest') {
      this.waveManager.scheduleFirstWave();
    }

    // Clean up lobby listeners when leaving the scene
    this.events.once('shutdown', () => {
      stopGameMusic();
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
    this.netSync.setupNetHandlers();
  }

  private hideGuestOverlays(): void {
    this.netSync.hideGuestOverlays();
  }

  private resetState(): void {
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.restingDebris = [];
    this.recentSplats = [];
    this.lives = STARTING_LIVES;
    this.score = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.isGameOver = false;
    this.enemiesSpawnedInWave = 0;
    this.playerEcon = null; // rebuilt in create() once the net role is known
    this.deathFx = new DeathEffects(this as any);
    this.ninjaCombat = new NinjaCombat(this as any, this.deathFx);
    this.netSync = new NetSyncManager(this as any);
    this.mapRenderer = new MapRenderer(this as any);
    this.towerMgr = new TowerManager(this as any);
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
      maxedOut: (type) => !this.canBuildMore(type, this.myPlayerId()),
      onAimChange: (mode) => {
        const tower = this.selectedTower;
        if (!tower || tower.ownerId !== this.myPlayerId()) return; // only your own towers
        if (this.netRole === 'guest') {
          lobby.sendCommand({ k: 'aim', id: tower.id, mode });
        } else {
          tower.targetMode = mode;
        }
      },
      onBaseChange: (base) => {
        const tower = this.selectedTower;
        if (!tower || tower.type !== 'ninja' || tower.ownerId !== this.myPlayerId()) return;
        if (this.netRole === 'guest') {
          lobby.sendCommand({ k: 'base', id: tower.id, base });
        } else {
          tower.ninjaBase = base;
        }
      },
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
    // Widget clicks set popupClickHandled during pointerdown — clear it at
    // pointerup so touch (scene-first ordering) never swallows the next tap
    this.input.on('pointerup', () => {
      this.popupClickHandled = false;
    });

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
    // Gameplay sounds ride the same event bus
    bindGameAudio(this);
    // Alert first, then the background music (scene passes itself for sfx)
    startGameMusic(this);

    // Farms pay their owner at the start of every wave (host only —
    // guests receive their gold through snapshots)
    eventBus.on('wave-started', () => {
      let paid = false;
      for (const t of this.towers) {
        if (t.type !== 'farm') continue;
        this.addGold(t.ownerId ?? this.myPlayerId(), farmIncome(t.level));
        paid = true;
      }
      if (paid) {
        this.refreshOwnGoldHud();
        playSfx(this, 'sfx_coin', { volume: 0.35, rate: 1.1 });
      }
    });
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
    this.resolveNinjaCollisions();
    this.resolveEnemyPhysics();
    this.updateTowerCombat(scaledDelta);
    this.updateProjectiles(scaledDelta);
    this.updateDebrisKicks(scaledDelta);
    this.updateHealthBarVisibility();

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
      // Wave 1 waits indefinitely for the button; later waves count down
      const auto = this.waveManager.isAutoStartEnabled();
      this.waveIndicator.showCountdown(auto);
      if (auto) {
        this.waveIndicator.setCountdown(this.waveManager.getAutoStartTimer());
      }
      this.waveIndicator.showStartButton(true);
      this.waveIndicator.setBonusText(`Bonus: +${this.waveManager.getEarlyStartBonus()}g`);
    } else if (this.waveManager.canStartNextWave()) {
      // Everything of this wave spawned — the next one may start now
      this.waveIndicator.showCountdown(false);
      this.waveIndicator.setBonusText('');
      this.waveIndicator.showStartButton(true);
    } else {
      this.waveIndicator.showCountdown(false);
      this.waveIndicator.setBonusText('');
    }
  }

  // ------------------------------------------------------------
  // Multiplayer: guest rendering from host snapshots
  // ------------------------------------------------------------

  private updateGuest(delta: number): void {
    this.netSync.updateGuest(delta);
  }

  private applySnapshot(snap: NetSnapshot): void {
    this.netSync.applySnapshot(snap);
  }

  private syncGuestTowers(snaps: Array<{ id: string; type: string; col: number; row: number; level: number; color: string; ownerId?: string; targetMode?: string; ninjaBase?: number }>): void {
    this.netSync.syncGuestTowers(snaps);
  }

  private syncGuestEnemies(snaps: Array<{ id: string; type: string; x: number; y: number; hp: number; hpMax: number; mini?: boolean; sl?: number; fight?: boolean }>): void {
    this.netSync.syncGuestEnemies(snaps);
  }

  private syncGuestProjectiles(
    snaps: Array<{ id: string; type: string; x: number; y: number; shrapnel?: boolean }>,
  ): void {
    this.netSync.syncGuestProjectiles(snaps);
  }

  // ------------------------------------------------------------
  // Multiplayer: host snapshot + command application
  // ------------------------------------------------------------

  private sendSnapshot(status: NetStatus): void {
    this.netSync.sendSnapshot(status);
  }

  private applyNetCommand(from: string, cmd: NetCommand): void {
    this.netSync.applyNetCommand(from, cmd);
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
    this.mapRenderer.drawGrid();
  }

  /** Layered hole graphics where roads start and end. */
  private drawSpawnBaseHoles(): void {
    this.mapRenderer.drawSpawnBaseHoles();
  }

  /**
   * Units jump OUT of the pipe when their route starts next to one:
   * a pop up from inside the tube, then they land and walk on.
   */
  private startHoleRise(enemy: Enemy): void {
    if (!enemy.alive) return;
    // Only check spawn/base points — not road splits
    const map = this.grid.getMapData();
    const spawns = map.spawnPoints?.length
      ? map.spawnPoints
      : map.basePath.length > 0
        ? [map.basePath[0]]
        : [];
    const bases = this.grid.getBasePoints();
    const holePts = [...spawns, ...bases].map((p) => this.grid.gridToWorld(p.x, p.y));
    const reachDist = this.grid.cellSize * 1.5;
    const nearHole = holePts.some((e) => Math.hypot(e.x - enemy.position.x, e.y - enemy.position.y) <= reachDist);
    if (!nearHole) return;
    // Emerge from the hole: start tucked inside — never deeper than
    // 20px — fade in, hop high over the rim, then land further along
    // (the unit keeps walking the road during the whole arc)
    enemy.fxY = 16;
    if (!enemy.data.invisible && enemy.sprite) {
      enemy.sprite.setAlpha(0);
      this.tweens.add({ targets: enemy.sprite, alpha: 1, duration: 220, ease: 'Power1.in' });
    }
    this.tweens.add({
      targets: enemy,
      fxY: -32,
      duration: 340,
      ease: 'Power2.out',
      onComplete: () => {
        this.tweens.add({ targets: enemy, fxY: 0, duration: 360, ease: 'Power2.in' });
      },
    });
  }

  /** The unit jumps INTO the pipe at the end of its route. */
  /** The unit hops in a half-circle arc into the pipe. */
  private sinkIntoHole(
    enemy: Enemy,
    endPt: { x: number; y: number },
    onLanded: () => void,
  ): void {
    const sprite = enemy.sprite;
    if (!sprite) {
      onLanded();
      return;
    }
    enemy.stopInvisibilityPulse();

    // Road approach direction
    const path = enemy.getPath();
    const rev = enemy.isReverse();
    const from = rev ? path[1] : path[Math.max(0, path.length - 2)];
    const to   = endPt;
    const dx   = to.x - from.x;
    const dy   = to.y - from.y;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const fromAbove  = !horizontal && dy < 0;

    const cs = this.grid.cellSize;
    const ARC   = cs * 0.75;
    const PLUNGE = cs * 0.3;
    const MS    = 500;

    // Arc from the character's current position to the hole center
    const startX = sprite.x;
    const startY = sprite.y;
    const endX   = to.x;
    const endY   = to.y;

    if (fromAbove) sprite.setDepth(8);

    const tween = this.tweens.add({
      targets: { t: 0 },
      t: 1,
      duration: MS,
      ease: 'Linear',
      onUpdate: (_tw, target) => {
        const t = target.t;
        sprite.x = startX + (endX - startX) * t;
        sprite.y = startY + (endY - startY) * t - Math.sin(Math.PI * t) * ARC;
      },
      onComplete: () => {
        if (fromAbove) sprite.setDepth(15);
        this.tweens.add({
          targets: sprite,
          y: endY + PLUNGE,
          duration: 200,
          ease: 'Power2.in',
          onComplete: onLanded,
        });
        this.tweens.add({ targets: sprite, alpha: 0, duration: 90, ease: 'Linear' });
      },
    });
    enemy.sinkTween = tween;
  }

  /**
   * Draw the level's background tile layer, loading any missing tile
   * textures first (tiles are fetched per level — not at game boot).
   */
  private drawBackgroundTiles(mapData: MapData): void {
    this.mapRenderer.drawBackgroundTiles(mapData);
  }

  private drawSmoothRoad(roadColor?: number, roadColorDark?: number): void {
    this.mapRenderer.drawSmoothRoad(roadColor, roadColorDark);
  }

  /**
   * Half-circle cap at both ends of a road: the outline wraps around
   * the open end so roads finish in a rounded semicircle instead of a
   * flat cut (radius = half the stroke width of the layer).
   */
  private drawSmoothPathCap(
    graphics: Phaser.GameObjects.Graphics,
    points: { x: number; y: number }[],
    radius: number,
    color: number,
  ): void {
    MapRenderer.drawSmoothPathCap(graphics, points, radius, color);
  }

  /** Multiply RGB channels of a color by a factor (clamped to 0-255). */
  private shadeColor(color: number, factor: number): number {
    return MapRenderer.shadeColor(color, factor);
  }

  /**
   * Stroke a catmull-rom curve in short segments so the first and last
   * two grid squares of every road fade in/out while the middle runs
   * at full strength.
   */
  private drawSmoothPath(graphics: Phaser.GameObjects.Graphics, points: { x: number; y: number }[]): void {
    MapRenderer.drawSmoothPath(graphics, points);
  }

  private blockSmoothRoadCells(): void {
    this.mapRenderer.blockSmoothRoadCells();
  }

  private blockPolylineCells(pathPixels: { x: number; y: number }[]): void {
    this.mapRenderer.blockPolylineCells(pathPixels);
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
    const canPlace = this.loadoutTypes.some((t) => this.grid.canPlaceAtBg(col, row, t) && this.canBuildMore(t, this.myPlayerId()));
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

    // Click outside the popup closes it — replaces the cancel buttons.
    // Bounds-checked so taps ON the popup survive touch input ordering
    if (this.towerPanel.isVisible()) {
      if (!this.towerPanel.contains(pointer.x, pointer.y)) {
        this.towerPanel.hide();
        this.cancelPendingBuild();
      }
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
      playSfx(this, 'sfx_ui_pling', { volume: 0.4 });
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
      playSfx(this, 'sfx_ui_click', { volume: 0.45 });
      this.selectedTower = existingTower;
      existingTower.showRange(true);
      const sellValue = this.economy.getSellValue(existingTower.type, existingTower.level);
      this.towerPanel.showAtCursor(pointer.x, pointer.y, 'tower', {
        type: existingTower.type,
        level: existingTower.level,
        sellValue,
        aim: existingTower.targetMode,
        owned: existingTower.ownerId === this.myPlayerId(),
        baseCount: this.grid.getBasePoints().length,
        selectedBase: existingTower.ninjaBase,
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

  /** Configured cap for one tower type: level override or the default. */
  private rawTowerLimit(type: TowerType): number {
    return this.towerMgr.rawTowerLimit(type);
  }

  /**
   * Effective cap for one player's build of `type`. Basics the player
   * did NOT bring in their loadout pass their budget evenly to the
   * basics they did (rounded up), so the combined basic cap stays the
   * same — missing one, the others grow. Multiplayer then halves
   * everything (rounded up) as before.
   */
  private towerLimitFor(type: TowerType, ownerId: string): number {
    return this.towerMgr.towerLimitFor(type, ownerId);
  }

  /** The loadout a player builds from (own list locally, synced lists on the host). */
  private loadoutOf(ownerId: string): string[] {
    return this.towerMgr.loadoutOf(ownerId);
  }

  /** How many of this type this player has already built. */
  private towersBuiltBy(type: TowerType, ownerId: string): number {
    return this.towerMgr.towersBuiltBy(type, ownerId);
  }

  private canBuildMore(type: TowerType, ownerId: string): boolean {
    return this.towerMgr.canBuildMore(type, ownerId);
  }

  /** Towers pop up from a speck so a build reads as growth. */
  private growInTower(tower: Tower): void {
    this.towerMgr.growInTower(tower);
  }

  /**
   * Tuck the painted background tiles covering the TOP half of a placed
   * tower's footprint below the tower. The tile layer renders at depth
   * 10 — above ordinary towers (5) — so painted terrain would otherwise
   * bury the upper half of the sprite.
   */
  private tuckTopTilesUnderTower(tower: Tower): void {
    this.mapRenderer.tuckTopTilesUnderTower(tower);
  }

  private placeTower(col: number, row: number, type: TowerType, ownerId?: string, colorHex?: string): void {
    this.towerMgr.placeTower(col, row, type, ownerId, colorHex);
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
    this.towerMgr.onSellTower();
  }

  private sellTower(tower: Tower, actorId: string = this.myPlayerId()): void {
    this.towerMgr.sellTower(tower, actorId);
  }

  private onUpgradeTower(): void {
    this.towerMgr.onUpgradeTower();
  }

  private upgradeTower(tower: Tower, actorId: string = this.myPlayerId()): void {
    this.towerMgr.upgradeTower(tower, actorId);
  }

  private animateRangeGrowth(worldPos: { x: number; y: number }, fromRadius: number, toRadius: number): void {
    this.towerMgr.animateRangeGrowth(worldPos, fromRadius, toRadius);
  }

  private findTowerAt(col: number, row: number): Tower | null {
    return this.towers.find(t => t.getGridCol() === col && t.getGridRow() === row) || null;
  }

  /**
   * HP bars are shown only for what the player is looking at: the
   * selected enemy, anything a projectile is flying at, and anything a
   * ninja has locked in melee.
   */
  private updateHealthBarVisibility(): void {
    const show = new Set<string>();
    if (this.selectedEnemy) show.add(this.selectedEnemy.id);
    for (const p of this.projectiles) {
      const id = p.alive ? p.getTargetId() : '';
      if (id) show.add(id);
    }
    for (const e of this.enemies) {
      if (e.friendly && e.combatTargetId) show.add(e.combatTargetId);
    }
    for (const e of this.enemies) e.showHealthBar(show.has(e.id));
  }

  /** Walking enemies knock resting corpse parts (bones and shards) around. */
  private updateDebrisKicks(deltaMs: number): void {
    this.deathFx.updateDebrisKicks(deltaMs);
  }

  /** A walking enemy shoves a resting corpse part: it hops away and tumbles. */
  private kickDebris(bone: Phaser.GameObjects.Image, fromX: number, fromY: number): void {
    this.deathFx.kickDebris(bone, fromX, fromY);
  }

  private updateEnemies(deltaMs: number): void {
    const cs = this.grid.cellSize;
    // Abort the sink animation if knocked this far from the hole
    const ABORT_DIST = cs * 2.5;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) continue;
      const reachedBase = enemy.update(deltaMs);
      // Splitter finished its 2s stop: burst into four minis (host only —
      // guests receive them through snapshots)
      if (enemy.consumeSplitRequest() && this.netRole !== 'guest') {
        this.spawnSplitterMinis(enemy);
      }

      const path = enemy.getPath();
      const endPt = enemy.isReverse() ? path[0] : path[path.length - 1];

      // If already sinking: abort if knocked away from the hole,
      // otherwise let the tween run and wait for it to complete
      if (enemy.sinking) {
        const dist = Math.hypot(enemy.position.x - endPt.x, enemy.position.y - endPt.y);
        if (dist > ABORT_DIST) {
          enemy.sinkTween?.stop();
          enemy.sinkTween = null;
          enemy.sinking = false;
          if (enemy.sprite) enemy.sprite.setAlpha(1);
        }
        // Skip the sink trigger below — it's already running or was
        // just aborted; the enemy will walk back to the hole next
        // frame and retrigger naturally
        continue;
      }

      // Reached the end of the path or close enough to the hole to
      // start the sink animation — keep the enemy alive and in the
      // game so towers can still hit it during the arc
      const from = enemy.isReverse() ? path[1] : path[Math.max(0, path.length - 2)];
      const adx = Math.abs(endPt.x - from.x);
      const ady = Math.abs(endPt.y - from.y);
      const sinkDist = adx > ady ? cs * 1.6 : cs * 0.4;
      const nearHole = Math.hypot(enemy.position.x - endPt.x, enemy.position.y - endPt.y) <= sinkDist;

      if (reachedBase || nearHole) {
        this.startSinkAnimation(enemy, endPt);
      }
    }
  }

  /** Begin the sink arc — enemy stays alive and in the list. */
  private startSinkAnimation(enemy: Enemy, endPt: { x: number; y: number }): void {
    enemy.sinking = true;
    enemy.healthBar?.setVisible(false);
    enemy.healthBarBg?.setVisible(false);
    if (this.selectedEnemy === enemy) this.deselectEnemy();

    const isFriendly = enemy.friendly;
    this.sinkIntoHole(enemy, endPt, () => {
      // Called when the arc and drop are done — NOW remove from play
      enemy.sinking = false;
      enemy.sinkTween = null;
      const idx = this.enemies.indexOf(enemy);
      if (idx >= 0) this.detachEnemy(enemy, idx);
      enemy.alive = false;
      enemy.destroy();
      if (!isFriendly) {
        eventBus.emit('enemy-reached-base', { damage: 1 });
      }
      // Check wave completion after the enemy is actually removed
      this.checkWaveComplete();
    });
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

  /** Fire-rate aura: every beacon covering this tower speeds it up. */
  private fireRateMultiplier(tower: Tower): number {
    return this.towerMgr.fireRateMultiplier(tower);
  }

  private updateTowerCombat(deltaMs: number): void {
    this.towerMgr.updateTowerCombat(deltaMs);
  }

  /** A ninja tower summons a unit at its chosen base, walking back up. */
  private spawnNinja(tower: Tower): void {
    this.ninjaCombat.spawnNinja(tower);
  }

  /**
   * Ninjas stop on the spot when they spot a hittable enemy in shooting
   * range and throw from there (L3+, quiver of 10). When the enemy comes
   * close and collides — or the quiver runs dry — they engage in close
   * combat: lock, press and trade blows until one side dies (or the
   * target outruns the leash). No lock and no contact: back to the path.
   */
  private resolveNinjaCollisions(): void {
    this.ninjaCombat.resolveNinjaCollisions();
  }

  /** A level 3+ ninja throws an arrow, cannonball or grenade at its target. */
  private ninjaThrow(ninja: Enemy, target: Enemy, profile: NinjaThrow): void {
    this.ninjaCombat.ninjaThrow(ninja, target, profile);
  }

  /**
   * Body physics: overlapping enemies trade a weight-based impulse —
   * heavier bodies barely budge while light ones get flung — and both
   * spin briefly from the hit. Phantoms and bats sit this out entirely.
   */
  private resolveEnemyPhysics(): void {
    this.ninjaCombat.resolveEnemyPhysics();
  }

  /** Kick both bodies apart: lighter ones fly farther, glancing hits spin more. */
  private applyCollisionImpulse(a: Enemy, b: Enemy, nx: number, ny: number, strength: number): void {
    this.ninjaCombat.applyCollisionImpulse(a, b, nx, ny, strength);
  }

  /**
   * Random hit reaction while a ninja trades blows: fly up spinning,
   * spin around through the sheet's directions, or tip over.
   */
  private ninjaHitFx(body: Enemy): void {
    this.ninjaCombat.ninjaHitFx(body);
  }

  /** One melee trade: the ninja bounces off; the enemy reacts by weight. */
  private ninjaCollide(ninja: Enemy, target: Enemy): void {
    this.ninjaCombat.ninjaCollide(ninja, target);
  }

  private findTarget(tower: Tower): TargetableEntity | null {
    return this.towerMgr.findTarget(tower);
  }

  private fireProjectile(tower: Tower, target: TargetableEntity): void {
    this.towerMgr.fireProjectile(tower, target);
  }

  private updateProjectiles(deltaMs: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) { proj.destroy(); this.projectiles.splice(i, 1); continue; }

      // Shrapnel flies straight, arming once clear of the blast, and
      // damages the first enemy it crosses
      if (proj.isShrapnel()) {
        const done = proj.update(deltaMs, null);
        const hit = proj.shrapnelArmed()
          ? this.enemies.find((e) =>
              e.alive && !e.friendly &&
              e.position.distanceTo(proj.position) <= e.data.size + 6 &&
              !(e.data.immuneTo && e.data.immuneTo.includes(proj.getTowerType())) &&
              canDamageEnemy(proj.getTowerType(), proj.towerLevel, e.data))
          : undefined;
        if (hit) {
          this.applyProjectileDamage(proj, hit);
          proj.alive = false;
        } else if (done) {
          proj.alive = false;
        }
        continue;
      }

      const targetEnemy = this.enemies.find(e => e.id === proj.getTargetId() && e.alive);
      const targetPos = targetEnemy ? targetEnemy.position : null;
      const reached = proj.update(deltaMs, targetPos);
      if (reached && targetEnemy && proj.hasHit(targetEnemy.position)) {
        // Grenades burst into shrapnel where they land
        if (proj.getTowerType() === 'grenade') this.detonateGrenade(proj);
        this.applyProjectileDamage(proj, targetEnemy);
        proj.alive = false;
      } else if (!targetPos) {
        // Target died in flight — grenades still go off
        if (proj.getTowerType() === 'grenade') this.detonateGrenade(proj);
        proj.alive = false;
      }
    }
  }

  /**
   * Explosion visuals + bang — shared by the host blast and the guest
   * mirror (guests only ever see the blast, never the damage).
   */
  private grenadeDetonationFx(x: number, y: number, boomScale: number = 1.5): void {
    if (this.textures.exists('fx_explosion')) {
      const boom = this.add.sprite(x, y, 'fx_explosion');
      boom.setDepth(15);
      boom.setScale(boomScale);
      boom.once('animationcomplete', () => boom.destroy());
      boom.play('fx_explosion');
    } else {
      const flash = this.add.circle(x, y, 7, 0xffd54f, 0.9);
      flash.setDepth(15);
      this.tweens.add({
        targets: flash,
        scaleX: 3 * boomScale,
        scaleY: 3 * boomScale,
        alpha: 0,
        duration: 260,
        ease: 'Power2.out',
        onComplete: () => flash.destroy(),
      });
    }
    playSfx(this, 'sfx_grenade_boom', { volume: 0.45 });
  }

  /**
   * Grenade detonation: flash and bang, then a spray of shrapnel that
   * flies outward and damages whatever it crosses.
   */
  private detonateGrenade(proj: Projectile): void {
    const x = proj.position.x;
    const y = proj.position.y;

    // A ninja's grenade just flashes and bangs — no shrapnel spray
    // (guests mirror this same fx when the mirrored projectile vanishes)
    if (proj.isNinjaThrow()) {
      this.grenadeDetonationFx(x, y);
      return;
    }

    // Higher levels blast bigger and throw more shrapnel
    const level = Math.max(1, proj.towerLevel);
    this.grenadeDetonationFx(x, y, 1.5 + (level - 1) * 0.35);

    // Shrapnel spray — single-target fragments (no splash of their own):
    // 5 at level 1, +2 per upgrade level
    const count = (TOWER_DEFINITIONS[proj.getTowerType()].shrapnelCount ?? 0) + (level - 1) * 2;
    const color = Phaser.Display.Color.HexStringToColor(TOWER_DEFINITIONS.grenade.color).color;
    const src = proj.damage;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2; // any direction from the blast center
      const shard = new Projectile(
        'grenade',
        x,
        y,
        {
          baseDamage: src.baseDamage,
          splashRadius: 0,
          slowFactor: src.slowFactor,
          slowDuration: src.slowDuration,
        } as any,
        '',
        color,
        220,
      );
      shard.ownerId = proj.ownerId;
      shard.towerLevel = proj.towerLevel;
      shard.spawnShrapnel(Math.cos(angle), Math.sin(angle), 80 + Math.random() * 50);
      shard.createSprite(this);
      this.projectiles.push(shard);
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
   
    // Splatter in the direction the projectile was travelling — how
    // much depends on the chunk of health this hit takes off, not just
    // whether it was the killing blow
    const dir = proj.getTravelDirection();
    const dmg = proj.damage;
    const hpFrac = dmg.baseDamage / Math.max(1, primaryTarget.health.max);
    const bloodSize = hpFrac >= 0.5 ? 2 : hpFrac >= 0.25 ? 1 : 0;
    this.createBloodSplatter(dir.x, dir.y, primaryTarget.position, primaryTarget.data.size, bloodSize);

    // The hit staggers the enemy briefly
    primaryTarget.applyImpact();
    const killed = this.healthSystem.applyDamage(
      { id: primaryTarget.id, position: primaryTarget.position, health: primaryTarget.health },
      dmg.baseDamage,
    );
    if (killed) this.onEnemyKilled(primaryTarget, proj.ownerId, dir);
    if (dmg.slowFactor < 1.0) {
      primaryTarget.health.applySlow(dmg.slowFactor, dmg.slowDuration);
    }
    if (dmg.splashRadius > 0) {
      const nearbyEnemies = this.enemies
        .filter(e => e.alive && e !== primaryTarget && !e.friendly
          && !(e.data.immuneTo && e.data.immuneTo.includes(proj.getTowerType()))
          && canDamageEnemy(proj.getTowerType(), proj.towerLevel, e.data))
        .map(e => ({ id: e.id, position: e.position, health: e.health }));
      // The blast staggers everyone in the radius
      for (const n of nearbyEnemies) {
        const victim = this.enemies.find(e => e.id === n.id);
        if (victim) victim.applyImpact();
      }
      const splashKilled = this.healthSystem.applySplashDamage(
        primaryTarget.position.x, primaryTarget.position.y, dmg.splashRadius, dmg.baseDamage * 0.5, nearbyEnemies,
      );
      for (const k of splashKilled) {
        const vx = k.position.x - primaryTarget.position.x;
        const vy = k.position.y - primaryTarget.position.y;
        const vlen = Math.hypot(vx, vy);
        const sd = vlen > 1 ? { x: vx / vlen, y: vy / vlen } : { x: 0, y: 1 };
        this.onEnemyKilledById(k.id, proj.ownerId, sd);
      }
    }
  }

  /**
   * Where a drip running down an object ends: the bottom edge of the
   * wall/tree column or tower under this point, or null on open ground.
   * Shared by blood splatter and death debris.
   */
  private dripEndY(x: number, y: number): number | null {
    return this.deathFx.dripEndY(x, y);
  }

  /**
   * The vertical drip — shared by blood and debris: hang straight down,
   * stretch, accelerate toward the foot, then continue.
   */
  private dripDown(target: Phaser.GameObjects.Arc | Phaser.GameObjects.Image, targetY: number, distance: number, then: () => void): void {
    this.deathFx.dripDown(target, targetY, distance, then);
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
    persist: boolean = false,
  ): void {
    this.deathFx.landDebris(piece, x, y, dirX, dirY, bounceCount, persist);
  }

  private createBloodSplatter(dirX: number, dirY: number, hitPos: Position, enemySize: number, bloodSize: number): void {
    this.deathFx.createBloodSplatter(dirX, dirY, hitPos, enemySize, bloodSize);
  }

  private createImmuneIndicator(x: number, y: number): void {
    this.deathFx.createImmuneIndicator(x, y);
  }

  private onEnemyKilled(enemy: Enemy, ownerId?: string | null, dir?: { x: number; y: number }): void {
    this.deathFx.onEnemyKilled(enemy, ownerId, dir);
  }

  /** Which death animation to play (phantoms never bleed out). */
  private pickDeathVariant(enemy: Enemy): DeathVariant {
    return this.deathFx.pickDeathVariant(enemy);
  }

  /**
   * A ninja fell in melee — same death variants as any enemy and guests
   * hear about it, but no kill reward and no wave-completion events.
   */
  private onNinjaKilled(ninja: Enemy, dir?: { x: number; y: number }): void {
    this.deathFx.onNinjaKilled(ninja, dir);
  }

  /** Play one of the three death animations; the variant owns the corpse sprite. */
  private playDeathVariant(enemy: Enemy, variant: DeathVariant): void {
    this.deathFx.playDeathVariant(enemy, variant);
  }

  /** The host said this enemy died — play the same animation here. */
  private playGuestDeath(id: string, variant: DeathVariant): void {
    this.deathFx.playGuestDeath(id, variant);
  }

  private onEnemyKilledById(id: string, ownerId?: string | null, dir?: { x: number; y: number }): void {
    this.deathFx.onEnemyKilledById(id, ownerId, dir);
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
    return this.deathFx.glideObstacleAt(x, y, selfSize);
  }

  /**
   * Once the corpse has glided to rest, running enemies shove it around:
   * contact pushes it away, the skid bounces off anything that isn't
   * ground, and friction brings it to a stop. Stops when the fade begins.
   */
  private enableCorpsePush(enemy: Enemy, sprite: Phaser.GameObjects.Image, onMove?: () => void): void {
    this.deathFx.enableCorpsePush(enemy, sprite, onMove);
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
    return this.deathFx.buildGlidePath(startX, startY, dir, distance, selfSize);
  }

  /**
   * Glide a piece down to the ground under a tower (restoring the
   * stretch dripDown applies), then continue.
   */
  private glideOffTower(
    piece: Phaser.GameObjects.Image,
    tower: { cx: number; cy: number },
    then: () => void,
  ): void {
    this.deathFx.glideOffTower(piece, tower, then);
  }

  private deathBleedOut(enemy: Enemy): void {
    this.deathFx.deathBleedOut(enemy);
  }

  /** Small spurt of blood spraying out from the dying sprite. */
  private bloodSpurt(x: number, y: number): void {
    this.deathFx.bloodSpurt(x, y);
  }


  /** Blood drips out from under the corpse into a spreading pool that dries. */
  private bleedOutPool(x: number, y: number, corpseSize: number): Phaser.GameObjects.Arc {
    return this.deathFx.bleedOutPool(x, y, corpseSize);
  }

  /**
   * Death variant: the corpse slides off the road, tips over ~100
   * degrees, then explodes and splatters like the usual death.
   */
  private deathTipOver(enemy: Enemy): void {
    this.deathFx.deathTipOver(enemy);
  }

  /**
   * Death explosion: cut the enemy's current sprite frame into a 3x3
   * grid of shards (added as sub-frames of its texture) and fling them
   * outward with spin — the sprite bursts apart where it stood.
   */
  private explodeEnemySprite(enemy: Enemy): void {
    this.deathFx.explodeEnemySprite(enemy);
  }

  private createDeathEffect(x: number, y: number, color: string): void {
    this.deathFx.createDeathEffect(x, y, color);
  }

  /** A splitter bursts into four smaller copies of itself. */
  private spawnSplitterMinis(parent: Enemy): void {
    const path = this.grid.getPathPixels();
    for (let i = 0; i < 4; i++) {
      const mini = new Enemy(parent.type, path, undefined, { mini: true });
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
      mini.position.set(
        parent.position.x + Math.cos(a) * 14,
        parent.position.y + Math.sin(a) * 14,
      );
      // Keep walking the parent's leg of the path, not from the start
      mini.syncPathProgressFrom(parent);
      mini.createSprite(this);
      this.enemies.push(mini);
    }
  }

  private spawnEnemy(
    type: EnemyType,
    routing?: { pathTurns?: number[]; spawnPoint?: number },
  ): void {
    // Spawn point: the entry's pick, or a fresh random one per spawn.
    // Out-of-range indices (including missing spawnPoints arrays) are
    // passed through — resolveRoutePixels handles the fallback to the
    // main road start gracefully.
    const spawnCount = this.grid.getSpawnPixels().length;
    const spawnIdx =
      routing?.spawnPoint !== undefined &&
      Number.isInteger(routing.spawnPoint) &&
      routing.spawnPoint >= 0
        ? spawnCount > 0
          ? routing.spawnPoint % spawnCount
          : 0
        : spawnCount > 0
          ? Math.floor(Math.random() * spawnCount)
          : 0;
    // Route: entry turns through the path splits, randomized when absent
    const path = this.grid.resolveRoutePixels(spawnIdx, routing?.pathTurns);
    const enemy = new Enemy(type, path);
    enemy.createSprite(this);
    this.enemies.push(enemy);
    this.startHoleRise(enemy);
    this.enemiesSpawnedInWave++;
  }

  private startNextWave(): void {
    if (this.isGameOver) return;
    // Guest: ask the host to start the wave
    if (this.netRole === 'guest') {
      lobby.sendCommand({ k: 'wave' });
      return;
    }
    // Start the waiting wave — or skip ahead when the current one has
    // spawned everything but leftovers are still fighting. If neither
    // happens (e.g. a stray mid-wave press) touch nothing: resetting
    // counters here would stall wave completion forever
    const started =
      this.waveManager.startNextWhileActive() || this.waveManager.startWave();
    if (!started) return;
    this.enemiesSpawnedInWave = 0;
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
    } else if (this.waveManager.canStartNextWave()) {
      // Everything of this wave has spawned — start the next one now
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
      // Friendly ninjas don't belong to the wave — they can't stall it
      remainingEnemies: this.enemies.filter((e) => !e.friendly).length,
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
        difficulty: this.currentDifficulty,
      });
      return;
    }

    this.scene.start('GameOverScene', {
      victory, score: this.score, wave: this.finalWaveNumber(),
      levelId: this.currentLevelId, difficulty: this.currentDifficulty,
    });
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
