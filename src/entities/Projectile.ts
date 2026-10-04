import Phaser from 'phaser';
import type { TowerType } from '../types';
import { Position } from '../components/Position';
import { Damage } from '../components/Damage';
import { Enemy } from './Enemy';

/**
 * Projectile type to sprite mapping
 */
// Partial: non-shooting towers (farm) have no projectile sprite.
const PROJECTILE_SPRITES: Partial<Record<TowerType, string>> = {
  arrow: 'projectile_arrow',
  cannon: 'projectile_cannon',
  frost: 'projectile_frost',
  sniper: 'projectile_sniper',
  mortar: 'projectile_mortar',
  tesla: 'projectile_tesla',
  grenade: 'projectile_grenade',
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
  /** Level of the firing tower (used for damage eligibility, e.g. phantoms). */
  towerLevel: number = 1;

  private targetId: string;
  private towerType: TowerType;
  private color: number;
  private prevX: number;
  private prevY: number;
  /** Straight-line flight from a detonation (grenade shrapnel). */
  private shrapnelDir: { x: number; y: number } | null = null;
  private shrapnelLeft: number = 0;
  private shrapnelTravel: number = 0;
  /** Thrown by a ninja (L5 grenades flash and bang, never spray shrapnel). */
  private ninjaThrow: boolean = false;

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
    if (spriteKey && scene.textures.exists(spriteKey)) {
      this.sprite = scene.add.image(this.position.x, this.position.y, spriteKey);
      // Shrapnel reads as an oval stretched along its flight line —
      // update() keeps the rotation on the travel direction
      this.sprite.setDisplaySize(this.isShrapnel() ? 15 : 12, this.isShrapnel() ? 6 : 12);
      this.sprite.setDepth(26);
    } else {
      // Fallback to circle if sprite not loaded
      this.sprite = scene.add.circle(
        this.position.x,
        this.position.y,
        3,
        this.color,
      );
      this.sprite.setDepth(26);
    }
  }

  /** Turn this projectile into shrapnel flying straight from a blast. */
  spawnShrapnel(dirX: number, dirY: number, distance: number): void {
    const len = Math.hypot(dirX, dirY) || 1;
    this.shrapnelDir = { x: dirX / len, y: dirY / len };
    this.shrapnelLeft = distance;
    this.shrapnelTravel = 0;
    this.targetId = '';
  }

  isShrapnel(): boolean {
    return this.shrapnelDir !== null;
  }

  /** Mark this as a ninja's hand-thrown projectile. */
  markAsNinjaThrow(): void {
    this.ninjaThrow = true;
  }

  isNinjaThrow(): boolean {
    return this.ninjaThrow;
  }

  /**
   * Shrapnel arms after flying clear of the blast, so the grenade's
   * own target isn't shredded by all five fragments at once.
   */
  shrapnelArmed(): boolean {
    return this.shrapnelTravel >= 36;
  }

  /**
   * Move toward target. Returns true if reached target position.
   */
  update(deltaMs: number, targetPos: Position | null): boolean {
    if (!this.alive) return true;

    // Shrapnel: straight flight with a fixed budget, no target needed
    if (this.shrapnelDir) {
      this.prevX = this.position.x;
      this.prevY = this.position.y;
      const step = Math.min(this.shrapnelLeft, (this.speed * deltaMs) / 1000);
      this.position.x += this.shrapnelDir.x * step;
      this.position.y += this.shrapnelDir.y * step;
      this.shrapnelLeft -= step;
      this.shrapnelTravel += step;
      if (this.sprite) {
        this.sprite.setPosition(this.position.x, this.position.y);
        this.sprite.setRotation(Math.atan2(this.shrapnelDir.y, this.shrapnelDir.x));
      }
      if (this.shrapnelLeft <= 0) {
        this.alive = false;
        return true;
      }
      return false;
    }

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
    this.shrapnelDir = null;
    this.shrapnelLeft = 0;
    this.shrapnelTravel = 0;
    this.alive = true;
  }
}
