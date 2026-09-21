import Phaser from 'phaser';
import type { TowerType, TowerData, TargetMode } from '../types';
import { TOWER_DEFINITIONS, TOWER_UPGRADES } from '../data/towers';
import { Position } from '../components/Position';
import { Health } from '../components/Health';
import { Damage } from '../components/Damage';
import { CELL_SIZE } from '../config/constants';

/**
 * Tower type to sprite mapping
 */
const TOWER_SPRITES: Record<TowerType, string> = {
  arrow: 'tower_arrow',
  cannon: 'tower_cannon',
  frost: 'tower_frost',
};

/**
 * Base tower class.
 * Towers are placed on the grid and fire projectiles at enemies.
 */
export class Tower {
  id: string;
  type: TowerType;
  data: TowerData;
  position: Position;
  level: number = 1;
  targetMode: TargetMode = 'first';
  fireTimer: number = 0;

  // Phaser objects (set when added to scene)
  sprite: Phaser.GameObjects.Image | null = null;
  rangeCircle: Phaser.GameObjects.Arc | null = null;
  scene: Phaser.Scene | null = null;

  // Stats (with upgrade multipliers applied)
  damage: number;
  fireRate: number;
  range: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;

  private gridCol: number;
  private gridRow: number;

  constructor(type: TowerType, gridCol: number, gridRow: number, id?: string) {
    this.type = type;
    this.data = TOWER_DEFINITIONS[type];
    this.id = id || `tower_${type}_${gridCol}_${gridRow}`;
    this.gridCol = gridCol;
    this.gridRow = gridRow;

    const worldPos = this.getWorldPosition();
    this.position = new Position(worldPos.x, worldPos.y);
    this.damage = this.data.damage;
    this.fireRate = this.data.fireRate;
    this.range = this.data.range;
    this.splashRadius = this.data.splashRadius;
    this.slowFactor = this.data.slowFactor;
    this.slowDuration = this.data.slowDuration;
  }

  /**
   * Create visual representation in the Phaser scene.
   */
  createSprite(scene: Phaser.Scene): void {
    this.scene = scene;
    const worldPos = this.getWorldPosition();

    // Use sprite image
    const spriteKey = TOWER_SPRITES[this.type];
    this.sprite = scene.add.image(worldPos.x, worldPos.y, spriteKey);
    this.sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
    this.sprite.setDepth(5);

    // Range indicator (hidden by default)
    this.rangeCircle = scene.add.circle(
      worldPos.x,
      worldPos.y,
      this.range,
      0xffffff,
      0,
    );
    this.rangeCircle.setStrokeStyle(1, 0xffffff, 0.3);
    this.rangeCircle.setDepth(6);
    this.rangeCircle.setVisible(false);
  }

  showRange(visible: boolean): void {
    if (this.rangeCircle) {
      this.rangeCircle.setVisible(visible);
    }
  }

  upgrade(): boolean {
    const nextData = TOWER_UPGRADES[this.level]; // level is 1-indexed, upgrades[1] = level 2
    if (!nextData) return false;

    this.level++;
    this.damage = Math.floor(this.data.damage * nextData.damageMultiplier);
    this.fireRate = this.data.fireRate * nextData.fireRateMultiplier;
    this.range = this.data.range * nextData.rangeMultiplier;

    // Update range circle
    if (this.rangeCircle) {
      this.rangeCircle.setRadius(this.range);
    }

    // Visual feedback - add golden glow for upgraded towers
    if (this.sprite) {
      this.sprite.setTint(0xFFD700); // Gold tint for upgraded
      // Scale up slightly
      this.sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
    }

    return true;
  }

  update(deltaMs: number): void {
    this.fireTimer -= deltaMs;
  }

  canFire(): boolean {
    return this.fireTimer <= 0;
  }

  fire(): void {
    this.fireTimer = 1000 / this.fireRate;
  }

  getWorldPosition(): { x: number; y: number } {
    return {
      x: this.gridCol * CELL_SIZE + CELL_SIZE / 2,
      y: this.gridRow * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  getGridCol(): number {
    return this.gridCol;
  }

  getGridRow(): number {
    return this.gridRow;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.rangeCircle?.destroy();
    this.sprite = null;
    this.rangeCircle = null;
  }
}
