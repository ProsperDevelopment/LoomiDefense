import { Enemy } from '../entities/Enemy';
import type { EnemyType } from '../types';
import { Tower } from '../entities/Tower';
import type { TowerType, TargetMode } from '../types';
import type { Projectile } from '../entities/Projectile';
import type { Grid } from '../utils/Grid';
import type { WaveManager } from './WaveManager';
import type { EconomySystem } from './EconomySystem';
import type { PlayerEconomy } from './PlayerEconomy';
import type { HealthSystem } from './HealthSystem';
import type { HUD } from '../ui/HUD';
import type { WaveIndicator } from '../ui/WaveIndicator';
import type { TowerPanel } from '../ui/TowerPanel';
import type { NetSnapshot, NetStatus, NetCommand, DeathVariant } from '../../shared/protocol';
import { TARGET_MODES } from '../types';
import { TOWER_DEFINITIONS } from '../data/towers';
import { deathSplatterTier } from './DeathEffects';
import { NINJA_LEVEL_TINTS } from './NinjaCombat';
import { Position } from '../components/Position';
import { lobby } from '../ui/overlay/lobbyScreen';
import { userProfile } from '../state/UserProfile';

// ── Host interface ───────────────────────────────────────────

export interface NetSyncHost {
  netRole: 'host' | 'guest' | null;
  isGameOver: boolean;
  lives: number;
  score: number;
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  selectedEnemy: Enemy | null;
  selectedTower: Tower | null;
  guestEnemyTargets: Map<string, { x: number; y: number }>;
  guestProjectiles: Map<string, { img: Phaser.GameObjects.Image; tx: number; ty: number; type: string; shrapnel: boolean }>;
  pendingSnaps: NetSnapshot[];
  guestWaveNumber: number;
  playerEcon: PlayerEconomy | null;

  grid: Grid;
  economy: EconomySystem;
  healthSystem: HealthSystem;
  waveManager: WaveManager;
  hud: HUD;
  waveIndicator: WaveIndicator;
  towerPanel: TowerPanel;
  tweens: Phaser.Tweens.TweenManager;
  time: Phaser.Time.Clock;
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
  scene: Phaser.Scenes.SceneManager;

  myPlayerId(): string;
  gameOver(victory: boolean): void;
  deselectEnemy(): void;
  deselectTower(): void;
  startHoleRise(enemy: Enemy): void;
  createBloodSplatter(dirX: number, dirY: number, hitPos: { x: number; y: number }, enemySize: number, bloodSize: number): void;
  playGuestDeath(id: string, variant: DeathVariant): void;
  updateTargetSight(): void;
  growInTower(tower: Tower): void;
  tuckTopTilesUnderTower(tower: Tower): void;
  placeTower(col: number, row: number, type: TowerType, ownerId: string, color: string): void;
  upgradeTower(tower: Tower, ownerId: string): void;
  sellTower(tower: Tower, ownerId: string): void;
  startNextWave(): void;
  startWaveEarly(playerId: string): void;
  grenadeDetonationFx(x: number, y: number, scale?: number): void;
}

// ── System ───────────────────────────────────────────────────

export class NetSyncManager {
  constructor(private s: NetSyncHost & Phaser.Scene) {}

  setupNetHandlers(): void {
    if (!this.s.netRole) return;

    lobby.onNet((from, data) => {
      if (this.s.isGameOver) return;
      if (this.s.netRole === 'host' && data.kind === 'cmd') {
        this.applyNetCommand(from, data.cmd);
      } else if (this.s.netRole === 'guest' && data.kind === 'snap') {
        this.s.pendingSnaps.push(data);
      } else if (this.s.netRole === 'guest' && data.kind === 'died') {
        this.s.playGuestDeath(data.id, data.variant);
      }
    });
    lobby.onClose(() => {
      if (this.s.netRole !== 'guest' || this.s.isGameOver) return;
      while (this.s.pendingSnaps.length > 0) {
        this.applySnapshot(this.s.pendingSnaps.shift()!);
      }
      this.s.scene.start('LevelSelectScene');
    });
  }

  hideGuestOverlays(): void {
    for (const { img } of this.s.guestProjectiles.values()) img.destroy();
    this.s.guestProjectiles.clear();
    this.s.guestEnemyTargets.clear();
  }

  updateGuest(delta: number): void {
    while (this.s.pendingSnaps.length > 1) this.s.pendingSnaps.shift();
    const snap = this.s.pendingSnaps.shift();
    if (snap) this.applySnapshot(snap);

    for (const enemy of this.s.enemies) {
      const t = this.s.guestEnemyTargets.get(enemy.id);
      if (!t) continue;
      const k = Math.min(1, delta / 90);
      enemy.position.x += (t.x - enemy.position.x) * k;
      enemy.position.y += (t.y - enemy.position.y) * k;
      enemy.refresh();
    }

    for (const { img, tx, ty } of this.s.guestProjectiles.values()) {
      const k = Math.min(1, delta / 90);
      img.x += (tx - img.x) * k;
      img.y += (ty - img.y) * k;
    }

    const selectedId = this.s.selectedEnemy?.id;
    for (const enemy of this.s.enemies) enemy.showHealthBar(enemy.id === selectedId);

    this.s.updateTargetSight();

    this.s.waveIndicator.showCountdown(false);
    this.s.waveIndicator.setBonusText('');
    this.s.waveIndicator.showStartButton(true);
  }

  applySnapshot(snap: NetSnapshot): void {
    const myId = this.s.myPlayerId();
    const myGold = snap.golds && myId in snap.golds ? snap.golds[myId] : snap.gold;
    if (this.s.economy.getGold() !== myGold) {
      this.s.economy.reset(myGold);
      this.s.hud.setGold(myGold);
    }
    if (this.s.lives !== snap.lives) {
      this.s.lives = snap.lives;
      this.s.hud.setLives(snap.lives);
    }
    if (this.s.score !== snap.score) {
      this.s.score = snap.score;
      this.s.hud.setScore(snap.score);
    }
    this.s.hud.setWave(snap.wave, snap.waveTotal);
    this.s.waveIndicator.setWave(snap.wave, snap.waveTotal);
    this.s.guestWaveNumber = snap.wave;

    this.syncGuestTowers(snap.towers);
    this.syncGuestEnemies(snap.enemies);
    this.syncGuestProjectiles(snap.projectiles ?? []);

    if (snap.status === 'won') this.s.gameOver(true);
    else if (snap.status === 'lost') this.s.gameOver(false);
  }

  syncGuestTowers(snaps: Array<{ id: string; type: string; col: number; row: number; level: number; color: string; ownerId?: string; targetMode?: string; ninjaBase?: number }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let tower = this.s.towers.find((t) => t.id === s.id);
      if (!tower) {
        if (!(s.type in TOWER_DEFINITIONS)) continue;
        tower = new Tower(s.type as TowerType, s.col, s.row, s.id);
        tower.ownerId = s.ownerId ?? null;
        if (s.color) tower.setPlayerColor(s.color);
        tower.createSprite(this.s);
        tower.showRange(false);
        this.s.towers.push(tower);
        this.s.growInTower(tower);
        this.s.tuckTopTilesUnderTower(tower);
        if (this.s.grid.canPlaceAtBg(s.col, s.row, s.type as TowerType)) {
          this.s.grid.placeTowerAtBg(s.col, s.row, s.type as TowerType);
        }
        while (tower.level < s.level) tower.upgrade();
      } else {
        tower.ownerId = s.ownerId ?? tower.ownerId;
        if (tower.level < s.level) {
          while (tower.level < s.level) tower.upgrade();
          if (this.s.selectedTower === tower) this.s.towerPanel.hide();
        }
      }
      if (s.targetMode && TARGET_MODES.includes(s.targetMode as TargetMode)) {
        tower.targetMode = s.targetMode as TargetMode;
      }
      if (s.ninjaBase !== undefined) tower.ninjaBase = s.ninjaBase;
    }
    for (let i = this.s.towers.length - 1; i >= 0; i--) {
      const tower = this.s.towers[i];
      if (!seen.has(tower.id)) {
        if (this.s.selectedTower === tower) this.s.deselectTower();
        this.s.grid.removeTowerAtBg(tower.getGridCol(), tower.getGridRow());
        tower.destroy();
        this.s.towers.splice(i, 1);
      }
    }
  }

  syncGuestEnemies(snaps: Array<{ id: string; type: string; x: number; y: number; hp: number; hpMax: number; mini?: boolean; sl?: number; fight?: boolean }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let enemy = this.s.enemies.find((e) => e.id === s.id);
      if (!enemy) {
        const path = this.s.grid.getPathPixels();
        enemy = new Enemy(s.type as EnemyType, path, s.id, { mini: s.mini });
        if (s.sl) enemy.summonLevel = s.sl;
        enemy.createSprite(this.s);
        const tint = s.sl ? NINJA_LEVEL_TINTS[s.sl] : undefined;
        if (tint !== undefined && enemy.sprite) enemy.sprite.setTint(tint);
        this.s.enemies.push(enemy);
        enemy.position.set(s.x, s.y);
        this.s.startHoleRise(enemy);
      }
      const prevHp = enemy.health.current;
      const prevX = enemy.position.x;
      const prevY = enemy.position.y;
      enemy.health.current = Math.max(1, Math.min(s.hp, enemy.health.max));
      if (s.hp < prevHp) {
        const dx = s.x - prevX;
        const dy = s.y - prevY;
        const len = Math.hypot(dx, dy);
        const dir = len > 1 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 };
        const frac = (prevHp - s.hp) / Math.max(1, s.hpMax);
        const bloodSize = frac >= 0.5 ? 2 : frac >= 0.25 ? 1 : 0;
        this.s.createBloodSplatter(dir.x, dir.y, new Position(s.x, s.y), enemy.data.size, bloodSize);
      }
      enemy.fighting = s.fight === true;
      this.s.guestEnemyTargets.set(s.id, { x: s.x, y: s.y });
    }
    for (let i = this.s.enemies.length - 1; i >= 0; i--) {
      const enemy = this.s.enemies[i];
      if (!seen.has(enemy.id)) {
        this.s.createBloodSplatter(0, 1, enemy.position, enemy.data.size, deathSplatterTier(enemy.health.max));
        if (this.s.selectedEnemy === enemy) this.s.deselectEnemy();
        this.s.guestEnemyTargets.delete(enemy.id);
        enemy.destroy();
        this.s.enemies.splice(i, 1);
      }
    }
  }

  syncGuestProjectiles(snaps: Array<{ id: string; type: string; x: number; y: number; shrapnel?: boolean }>): void {
    const seen = new Set<string>();
    for (const s of snaps) {
      seen.add(s.id);
      let entry = this.s.guestProjectiles.get(s.id);
      if (!entry) {
        const key = `projectile_${s.type}`;
        if (!this.s.textures.exists(key)) continue;
        const img = this.s.add.image(s.x, s.y, key);
        img.setDisplaySize(12, 12);
        img.setDepth(26);
        entry = { img, tx: s.x, ty: s.y, type: s.type, shrapnel: s.shrapnel ?? false };
        this.s.guestProjectiles.set(s.id, entry);
      }
      entry.tx = s.x;
      entry.ty = s.y;
    }
    for (const [id, entry] of this.s.guestProjectiles) {
      if (!seen.has(id)) {
        if (entry.type === 'grenade' && !entry.shrapnel) {
          this.s.grenadeDetonationFx(entry.tx, entry.ty);
        }
        entry.img.destroy();
        this.s.guestProjectiles.delete(id);
      }
    }
  }

  sendSnapshot(status: NetStatus): void {
    if (this.s.netRole !== 'host') return;
    const golds = this.s.playerEcon?.toRecord() ?? { [this.s.myPlayerId()]: this.s.economy.getGold() };
    lobby.sendSnapshot({
      kind: 'snap',
      status,
      gold: this.s.economy.getGold(),
      golds,
      lives: this.s.lives,
      wave: this.s.waveManager.getWaveNumber(),
      waveTotal: this.s.waveManager.getTotalWaves(),
      score: this.s.score,
      enemies: this.s.enemies
        .filter((e) => e.alive && !e.isDead())
        .map((e) => ({
          id: e.id,
          type: e.type,
          x: Math.round(e.position.x),
          y: Math.round(e.position.y),
          hp: e.health.current,
          hpMax: e.health.max,
          mini: e.isMini,
          sl: e.friendly && e.summonLevel > 1 ? e.summonLevel : undefined,
          fight: e.fighting || undefined,
        })),
      towers: this.s.towers.map((t) => ({
        id: t.id,
        type: t.type,
        col: t.getGridCol(),
        row: t.getGridRow(),
        level: t.level,
        color: t.tintColorHex ?? userProfile.towerColor,
        ownerId: t.ownerId ?? undefined,
        targetMode: t.targetMode,
        ninjaBase: t.ninjaBase,
      })),
      projectiles: this.s.projectiles
        .filter((p) => p.alive)
        .map((p) => ({
          id: p.id,
          type: p.getTowerType(),
          x: Math.round(p.position.x),
          y: Math.round(p.position.y),
          shrapnel: p.isShrapnel(),
        })),
    });
  }

  applyNetCommand(from: string, cmd: NetCommand): void {
    const senderColor =
      lobby.room?.players.find((p) => p.id === from)?.color ?? userProfile.towerColor;

    switch (cmd.k) {
      case 'place':
        this.s.placeTower(cmd.col, cmd.row, cmd.type as TowerType, from, senderColor);
        break;
      case 'upgrade': {
        const tower = this.s.towers.find((t) => t.id === cmd.id);
        if (tower) this.s.upgradeTower(tower, from);
        break;
      }
      case 'sell': {
        const tower = this.s.towers.find((t) => t.id === cmd.id);
        if (tower) this.s.sellTower(tower, from);
        break;
      }
      case 'aim': {
        const tower = this.s.towers.find((t) => t.id === cmd.id);
        if (tower && tower.ownerId === from && TARGET_MODES.includes(cmd.mode as TargetMode)) {
          tower.targetMode = cmd.mode as TargetMode;
        }
        break;
      }
      case 'base': {
        const tower = this.s.towers.find((t) => t.id === cmd.id);
        if (tower && tower.type === 'ninja' && tower.ownerId === from) {
          const count = this.s.grid.getBasePoints().length;
          tower.ninjaBase = Math.max(
            0,
            Math.min(Math.floor(cmd.base) || 0, Math.max(0, count - 1)),
          );
        }
        break;
      }
      case 'wave':
        this.s.startNextWave();
        break;
      case 'early':
        this.s.startWaveEarly(from);
        break;
    }
  }
}
