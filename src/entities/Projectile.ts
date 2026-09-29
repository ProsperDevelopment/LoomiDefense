import Phaser from 'phaser';
import type { TowerType } from '../types';
import { Position } from '../components/Position';
import { Damage } from '../components/Damage';
import { Enemy } from './Enemy';

/**
 * Projectile type to sprite mapping
 */
const PROJECTILE_SPRITES: Record<TowerType, string> = {
  arrow: 'projectile_arrow',
  cannon: 'projectile_cannon',
  frost: 'projectile_frost',
  sniper: 'projectile_sniper',
  mortar: 'projectile_mortar',
  tesla: 'projectile_tesla',
};

/**
 * Projectile fired by towers toward enemies.
 * Handles movement, collision detection, and damage application.
 */
export class Projectile {
  id: string;
  position: Position;
  damage: Damage;
  speed: number;
  alive: boolean = true;
  /** Player who fired this tower (kill rewards go to them). */
  ownerId: string | null = null;

  private targetId: string;
  private towerType: TowerType;
  private color: number;
  private prevX: number;
  private prevY: number;

  // Phaser objects
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Arc | null = null;
  scene: Phaser.Scene | null = null;

  constructor(
    towerType: TowerType,
    startX: number,
    startY: number,
    damage: Damage,
    targetId: string,
    color: number,
    speed: number = 300,
  ) {
    this.id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.towerType = towerType;
    this.position = new Position(startX, startY);
    this.damage = damage;
    this.targetId = targetId;
    this.color = color;
    this.speed = speed;
    this.prevX = startX;
    this.prevY = startY;
  }

  createSprite(scene: Phaser.Scene): void {
    this.scene = scene;

    const spriteKey = PROJECTILE_SPRITES[this.towerType];

    // Try to use sprite image, fall back to circle
    if (scene.textures.exists(spriteKey)) {
      this.sprite = scene.add.image(this.position.x, this.position.y, spriteKey);
      this.sprite.setDisplaySize(12, 12);
      this.sprite.setDepth(15);
    } else {
      // Fallback to circle if sprite not loaded
      this.sprite = scene.add.circle(
        this.position.x,
        this.position.y,
        3,
        this.color,
      );
      this.sprite.setDepth(15);
    }
  }

  /**
   * Move toward target. Returns true if reached target position.
   */
  update(deltaMs: number, targetPos: Position | null): boolean {
    if (!this.alive) return true;

    if (!targetPos) {
      this.alive = false;
      return true;
    }

    // Remember where we were before moving so the impact direction
    // can be computed even after the final step snaps onto the target
    this.prevX = this.position.x;
    this.prevY = this.position.y;

    const reached = this.position.moveToward(
      targetPos.x,
      targetPos.y,
      this.speed,
      deltaMs / 1000,
    );

    // Update sprite
    if (this.sprite) {
      this.sprite.setPosition(this.position.x, this.position.y);

      // Rotate projectile toward target
      const angle = Phaser.Math.Angle.Between(
        this.position.x,
        this.position.y,
        targetPos.x,
        targetPos.y,
      );
      this.sprite.setRotation(angle);
    }

    if (reached) {
      this.alive = false;
      return true;
    }

    return false;
  }

  /**
   * Check if projectile hit the target.
   */
  hasHit(targetPos: Position, hitRadius: number = 10): boolean {
    return this.position.distanceTo(targetPos) <= hitRadius;
  }

  /**
   * Normalized direction the projectile was travelling on its last step.
   * Falls back to (1, 0) when no movement has happened yet.
   */
  getTravelDirection(): { x: number; y: number } {
    const dx = this.position.x - this.prevX;
    const dy = this.position.y - this.prevY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return { x: 1, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  getTargetId(): string {
    return this.targetId;
  }

  getTowerType(): TowerType {
    return this.towerType;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }

  reset(
    towerType: TowerType,
    startX: number,
    startY: number,
    damage: Damage,
    targetId: string,
    color: number,
  ): void {
    this.towerType = towerType;
    this.position.set(startX, startY);
    this.prevX = startX;
    this.prevY = startY;
    this.damage = damage;
    this.targetId = targetId;
    this.color = color;
    this.alive = true;
  }
}
