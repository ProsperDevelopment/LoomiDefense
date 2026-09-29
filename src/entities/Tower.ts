import Phaser from 'phaser';
import type { TowerType, TowerData, TargetMode } from '../types';
import { TOWER_DEFINITIONS, TOWER_UPGRADES } from '../data/towers';
import { Position } from '../components/Position';
import { Health } from '../components/Health';
import { Damage } from '../components/Damage';
import { CELL_SIZE, GRID_OFFSET_Y } from '../config/constants';

/**
 * Centralized tower sprite frame mapping.
 * Tileset: 768x192 (12 cols x 3 rows, 64x64 tiles after 200% resize)
 * Each tower has 3 consecutive frames: normal, damaged1, damaged2
 * Frame 0-2: Tower 1 | Frame 3-5: Tower 2 | Frame 6-8: Tower 3
 */
export const TOWER_SPRITE_FRAMES: Record<TowerType, number> = {
  arrow: 0,   // 1st tower, normal
  cannon: 3,  // 2nd tower, normal
  frost: 6,   // 3rd tower, normal
  mortar: 12, // grey-green tower with mortar pot
  sniper: 18, // watchtower with crystal scope
  tesla: 30,  // dark teal tower with energy crystals
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

  /** Optional per-player tint color (0xRRGGBB). */
  tintColor: number | null = null;
  /** Hex string form of the player color (e.g. '#ff8800'). */
  tintColorHex: string | null = null;
  /** Player who owns this tower (their gold paid for it). */
  ownerId: string | null = null;

  private gridCol: number;
  private gridRow: number;
  private upgradeRings: Phaser.GameObjects.Arc[] = [];
  private ownerPad: Phaser.GameObjects.Arc | null = null;
  private ownerCrest: Phaser.GameObjects.Arc | null = null;

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

    // Use sprite from tower tileset
    const frame = TOWER_SPRITE_FRAMES[this.type];
    this.sprite = scene.add.image(worldPos.x, worldPos.y, 'towers_tileset', frame);
    this.sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
    this.sprite.setDepth(5);

    // Owner color goes on the base pad and crest — the tower art itself
    // keeps its original colors.
    if (this.tintColor !== null) {
      this.applyOwnerVisuals();
    }

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

  /** Apply a per-player color: colored base pad + crest, art untouched. */
  setPlayerColor(hex: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    this.tintColorHex = hex;
    this.tintColor = Phaser.Display.Color.HexStringToColor(hex).color;
    this.applyOwnerVisuals();
  }

  /**
   * Draw only small colored accents for the owner:
   *  - a translucent colored pad with a solid rim under the tower
   *  - a small colored crest gem above the tower
   * The tower sprite itself is never tinted.
   */
  private applyOwnerVisuals(): void {
    if (!this.scene || this.tintColor === null) return;
    const color = this.tintColor;
    const worldPos = this.getWorldPosition();

    this.ownerPad?.destroy();
    this.ownerCrest?.destroy();

    // Base pad: rim shows around the tower art
    const pad = this.scene.add.circle(worldPos.x, worldPos.y + 2, CELL_SIZE / 2 + 1, color, 0.28);
    pad.setStrokeStyle(2, color, 0.9);
    pad.setDepth(3);
    this.ownerPad = pad;

    // Crest gem above the battlements
    const crest = this.scene.add.circle(worldPos.x, worldPos.y - CELL_SIZE / 2 - 5, 3.5, color, 1);
    crest.setDepth(6);
    this.ownerCrest = crest;
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

    // Visual feedback - gold rings under the tower for each upgrade level.
    // (The tint itself is reserved for the per-player color.)
    if (this.scene) {
      const worldPos = this.getWorldPosition();
      const ring = this.scene.add.circle(
        worldPos.x,
        worldPos.y,
        CELL_SIZE / 2 + 3 + (this.upgradeRings.length * 2),
        0xFFD700,
        0,
      );
      ring.setStrokeStyle(2, 0xFFD700, 0.85);
      ring.setDepth(4);
      this.upgradeRings.push(ring);
      if (this.sprite) {
        this.sprite.setDisplaySize(CELL_SIZE, CELL_SIZE);
      }
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
      y: this.gridRow * CELL_SIZE + CELL_SIZE / 2 + GRID_OFFSET_Y,
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
    for (const ring of this.upgradeRings) ring.destroy();
    this.upgradeRings = [];
    this.ownerPad?.destroy();
    this.ownerPad = null;
    this.ownerCrest?.destroy();
    this.ownerCrest = null;
    this.sprite = null;
    this.rangeCircle = null;
  }
}
