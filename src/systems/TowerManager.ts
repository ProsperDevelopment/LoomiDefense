import Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import type { TowerType, TargetMode, MapData } from '../types';
import type { Grid } from '../utils/Grid';
import type { EconomySystem } from './EconomySystem';
import type { PlayerEconomy } from './PlayerEconomy';
import type { HealthSystem } from './HealthSystem';
import type { WaveManager } from './WaveManager';
import type { NinjaCombat } from './NinjaCombat';
import type { TargetableEntity } from './TargetingSystem';
import { TargetingSystem } from './TargetingSystem';
import { TOWER_DEFINITIONS, MAX_TOWER_LEVEL, DEFAULT_TOWER_LIMITS, BASIC_TOWERS, beaconFireRateBuff } from '../data/towers';
import { userProfile } from '../state/UserProfile';
import { lobby } from '../ui/overlay/lobbyScreen';
import { eventBus } from '../utils/EventBus';
import { canDamageEnemy } from '../utils/damageRules';
import { Projectile } from '../entities/Projectile';
import { Tower } from '../entities/Tower';
import { DEV_MODE } from '../config/constants';

// ── Host interface ───────────────────────────────────────────

export interface TowerManagerHost {
  netRole: 'host' | 'guest' | null;
  towers: Tower[];
  enemies: Enemy[];
  projectiles: Projectile[];
  selectedTower: Tower | null;
  selectedEnemy: Enemy | null;
  loadoutTypes: TowerType[];
  remoteLoadouts: Map<string, string[]>;
  hoverRangeCircle: Phaser.GameObjects.Arc | null;

  grid: Grid;
  economy: EconomySystem;
  playerEcon: PlayerEconomy | null;
  healthSystem: HealthSystem;
  waveManager: WaveManager;
  ninjaCombat: NinjaCombat;
  towerPanel: { hide(): void };
  tweens: Phaser.Tweens.TweenManager;
  time: Phaser.Time.Clock;
  add: Phaser.GameObjects.GameObjectFactory;

  myPlayerId(): string;
  spendGold(playerId: string, amount: number): boolean;
  addGold(playerId: string, amount: number): void;
  refreshOwnGoldHud(): void;
  deselectTower(): void;
  deselectEnemy(): void;
  tuckTopTilesUnderTower(tower: Tower): void;
  growInTower(tower: Tower): void;
}

// ── System ───────────────────────────────────────────────────

export class TowerManager {
  constructor(private s: TowerManagerHost & Phaser.Scene) {}

  rawTowerLimit(type: TowerType): number {
    const override = this.s.grid.getMapData().towerLimits?.[type];
    return override ?? DEFAULT_TOWER_LIMITS[type];
  }

  towerLimitFor(type: TowerType, ownerId: string): number {
    let limit = this.rawTowerLimit(type);
    if (BASIC_TOWERS.includes(type)) {
      const loadout = this.loadoutOf(ownerId);
      const mine = BASIC_TOWERS.filter((t) => loadout.includes(t));
      if (mine.length > 0 && mine.length < BASIC_TOWERS.length && mine.includes(type)) {
        const total = BASIC_TOWERS.reduce((n, t) => n + this.rawTowerLimit(t), 0);
        limit = Math.ceil(total / mine.length);
      }
    }
    return this.s.netRole !== null ? Math.ceil(limit / 2) : limit;
  }

  loadoutOf(ownerId: string): string[] {
    return ownerId === this.s.myPlayerId() ? this.s.loadoutTypes : this.s.remoteLoadouts.get(ownerId) ?? [];
  }

  towersBuiltBy(type: TowerType, ownerId: string): number {
    let n = 0;
    for (const t of this.s.towers) {
      if (t.type === type && t.ownerId === ownerId) n++;
    }
    return n;
  }

  canBuildMore(type: TowerType, ownerId: string): boolean {
    return this.towersBuiltBy(type, ownerId) < this.towerLimitFor(type, ownerId);
  }

  placeTower(col: number, row: number, type: TowerType, ownerId?: string, colorHex?: string): void {
    const data = TOWER_DEFINITIONS[type];
    if (!data) return;
    const isRemote = ownerId !== undefined && ownerId !== this.s.myPlayerId();
    const loadout = isRemote && !DEV_MODE ? this.s.remoteLoadouts.get(ownerId) : this.s.loadoutTypes;
    if (loadout && loadout.length > 0 && !loadout.includes(type)) return;
    if (!this.s.grid.canPlaceAtBg(col, row, type)) return;
    const owner = ownerId ?? this.s.myPlayerId();
    if (!this.canBuildMore(type, owner)) return;
    if (this.s.netRole === 'guest') {
      if (!this.s.economy.canAfford(data.cost)) return;
      lobby.sendCommand({ k: 'place', col, row, type });
      this.s.hoverRangeCircle?.setVisible(false);
      return;
    }
    if (!this.s.spendGold(owner, data.cost)) return;
    this.s.grid.placeTowerAtBg(col, row, type);
    const tower = new Tower(type, col, row);
    tower.ownerId = owner;
    tower.setPlayerColor(colorHex ?? userProfile.towerColor);
    tower.createSprite(this.s);
    tower.showRange(false);
    this.s.towers.push(tower);
    this.s.tuckTopTilesUnderTower(tower);
    eventBus.emit('tower-placed', { towerType: type, x: col, y: row });
    this.s.growInTower(tower);
    this.s.hoverRangeCircle?.setVisible(false);
    this.s.refreshOwnGoldHud();
  }

  sellTower(tower: Tower, actorId: string = this.s.myPlayerId()): void {
    if (tower.ownerId && tower.ownerId !== actorId) return;
    const refund = this.s.economy.getSellValue(tower.type, tower.level);
    this.s.addGold(actorId, refund);
    this.s.grid.removeTowerAtBg(tower.getGridCol(), tower.getGridRow());
    tower.destroy();
    this.s.towers = this.s.towers.filter((t) => t !== tower);
    eventBus.emit('tower-sold', { towerType: tower.type, refund });
    this.s.deselectTower();
    this.s.refreshOwnGoldHud();
  }

  upgradeTower(tower: Tower, actorId: string = this.s.myPlayerId()): void {
    if (tower.ownerId && tower.ownerId !== actorId) return;
    if (tower.level >= MAX_TOWER_LEVEL) return;
    const cost = this.s.economy.getUpgradeCost(tower.type, tower.level);
    if (!this.s.spendGold(actorId, cost)) return;
    const oldRange = tower.range;
    const worldPos = tower.getWorldPosition();
    tower.upgrade();
    const newRange = tower.range;
    tower.showRange(false);
    eventBus.emit('tower-upgraded', { towerType: tower.type, newLevel: tower.level });
    this.s.towerPanel.hide();
    this.s.refreshOwnGoldHud();
    this.animateRangeGrowth(worldPos, oldRange, newRange);
  }

  onSellTower(): void {
    if (!this.s.selectedTower) return;
    const tower = this.s.selectedTower;
    if (tower.ownerId && tower.ownerId !== this.s.myPlayerId()) {
      this.s.towerPanel.hide();
      return;
    }
    if (this.s.netRole === 'guest') {
      lobby.sendCommand({ k: 'sell', id: tower.id });
      this.s.towerPanel.hide();
      return;
    }
    this.sellTower(tower);
  }

  onUpgradeTower(): void {
    if (!this.s.selectedTower || this.s.selectedTower.level >= MAX_TOWER_LEVEL) return;
    const tower = this.s.selectedTower;
    if (tower.ownerId && tower.ownerId !== this.s.myPlayerId()) {
      this.s.towerPanel.hide();
      return;
    }
    if (this.s.netRole === 'guest') {
      lobby.sendCommand({ k: 'upgrade', id: tower.id });
      this.s.towerPanel.hide();
      return;
    }
    this.upgradeTower(tower);
  }

  growInTower(tower: Tower): void {
    if (!tower.sprite) return;
    const target = tower.sprite.scaleX;
    tower.sprite.setScale(target * 0.05);
    this.s.tweens.add({
      targets: tower.sprite,
      scaleX: target,
      scaleY: target,
      duration: 320,
      ease: 'Back.Out',
    });
  }

  animateRangeGrowth(worldPos: { x: number; y: number }, fromRadius: number, toRadius: number): void {
    const rangeCircle = this.s.add.circle(worldPos.x, worldPos.y, fromRadius, 0x4CAF50, 0);
    rangeCircle.setStrokeStyle(2, 0x4CAF50, 0.6);
    rangeCircle.setDepth(48);
    this.s.tweens.add({
      targets: rangeCircle,
      scaleX: toRadius / fromRadius,
      scaleY: toRadius / fromRadius,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        this.s.time.delayedCall(2000, () => {
          rangeCircle.destroy();
        });
      },
    });
  }

  fireRateMultiplier(tower: Tower): number {
    let mult = 1;
    for (const b of this.s.towers) {
      if (b.type !== 'beacon') continue;
      if (tower.position.distanceTo(b.position) > b.range) continue;
      mult += beaconFireRateBuff(b.level);
    }
    return mult;
  }

  findTarget(tower: Tower): TargetableEntity | null {
    if (
      this.s.selectedEnemy && this.s.selectedEnemy.alive && !this.s.selectedEnemy.isDead() &&
      !this.s.selectedEnemy.friendly &&
      canDamageEnemy(tower.type, tower.level, this.s.selectedEnemy.data)
    ) {
      const dist = tower.position.distanceTo(this.s.selectedEnemy.position);
      if (dist <= tower.range) {
        return { id: this.s.selectedEnemy.id, position: this.s.selectedEnemy.position, health: this.s.selectedEnemy.health, pathRemaining: this.s.selectedEnemy.pathRemaining() };
      }
    }
    const enemies = this.s.enemies
      .filter(e => e.alive && !e.isDead() && !e.friendly && canDamageEnemy(tower.type, tower.level, e.data))
      .map(e => ({ id: e.id, position: e.position, health: e.health, pathRemaining: e.pathRemaining() }));
    return TargetingSystem.findTarget(tower.position, tower.range, enemies, tower.targetMode);
  }

  fireProjectile(tower: Tower, target: TargetableEntity): void {
    const towerPos = tower.getWorldPosition();
    const damage = { baseDamage: tower.damage, splashRadius: tower.splashRadius, slowFactor: tower.slowFactor, slowDuration: tower.slowDuration };
    const proj = new Projectile(tower.type, towerPos.x, towerPos.y, damage as any, target.id, Phaser.Display.Color.HexStringToColor(tower.data.color).color);
    proj.ownerId = tower.ownerId;
    proj.towerLevel = tower.level;
    proj.createSprite(this.s);
    this.s.projectiles.push(proj);
    eventBus.emit('projectile-fired', { towerType: tower.type, x: towerPos.x, y: towerPos.y });
  }

  updateTowerCombat(deltaMs: number): void {
    for (const tower of this.s.towers) {
      tower.update(deltaMs, this.fireRateMultiplier(tower));
      if (tower.type === 'ninja') {
        this.s.ninjaCombat.trySummon(tower);
        continue;
      }
      if (!tower.canFire()) continue;
      const target = this.findTarget(tower);
      if (!target) continue;
      tower.fire();
      this.fireProjectile(tower, target);
    }
  }
}
