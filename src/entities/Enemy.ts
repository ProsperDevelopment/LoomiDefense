import Phaser from 'phaser';
import type { EnemyType, EnemyData } from '../types';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import { Position } from '../components/Position';
import { Health } from '../components/Health';

/**
 * Enemy type to sprite and animation mapping
 */
const ENEMY_SPRITES: Record<EnemyType, { key: string; anim: string }> = {
  basic: { key: 'enemy_ant', anim: 'ant_walk' },
  fast: { key: 'enemy_bat', anim: 'bat_fly' },
  armored: { key: 'enemy_monster', anim: 'monster_walk' },
  healer: { key: 'enemy_ant', anim: 'ant_walk' },
  swarm: { key: 'enemy_ant', anim: 'ant_walk' },
  tank: { key: 'enemy_monster', anim: 'monster_walk' },
  elite: { key: 'enemy_monster', anim: 'monster_walk' },
  boss: { key: 'enemy_monster', anim: 'monster_walk' },
};

/**
 * Base enemy class.
 * Enemies follow a path and can be damaged by towers.
 */
export class Enemy {
  id: string;
  type: EnemyType;
  data: EnemyData;
  position: Position;
  health: Health;

  // Path following
  private path: { x: number; y: number }[];
  private pathIndex: number = 0;
  private speed: number;
  private baseSpeed: number;

  // State
  alive: boolean = true;
  reachedBase: boolean = false;

  // Phaser objects
  sprite: Phaser.GameObjects.Sprite | null = null;
  healthBar: Phaser.GameObjects.Rectangle | null = null;
  healthBarBg: Phaser.GameObjects.Rectangle | null = null;
  scene: Phaser.Scene | null = null;

  // Animation
  private pulseTimer: number = 0;

  constructor(type: EnemyType, path: { x: number; y: number }[], id?: string) {
    this.type = type;
    this.data = ENEMY_DEFINITIONS[type];
    this.id = id || `enemy_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    this.path = path;

    this.baseSpeed = this.data.speed;
    this.speed = this.data.speed;
    this.position = new Position(path[0].x, path[0].y);
    this.health = new Health(this.data.hp, this.data.armor);
  }

  /**
   * Create visual representation in the Phaser scene.
   */
  createSprite(scene: Phaser.Scene): void {
    this.scene = scene;

    const spriteInfo = ENEMY_SPRITES[this.type];

    // Create animated sprite
    const sprite = scene.add.sprite(this.position.x, this.position.y, spriteInfo.key, 0);
    sprite.setDisplaySize(this.data.size * 2, this.data.size * 2);
    sprite.play(spriteInfo.anim);
    sprite.setDepth(10);
    this.sprite = sprite;

    // Health bar background
    this.healthBarBg = scene.add.rectangle(
      this.position.x,
      this.position.y - this.data.size - 6,
      this.data.size * 2,
      4,
      0x333333,
    );
    this.healthBarBg.setDepth(11);

    // Health bar
    this.healthBar = scene.add.rectangle(
      this.position.x,
      this.position.y - this.data.size - 6,
      this.data.size * 2,
      4,
      0x4CAF50,
    );
    this.healthBar.setOrigin(0, 0.5);
    this.healthBar.setDepth(12);
  }

  /**
   * Update enemy position along the path.
   */
  update(deltaMs: number): boolean {
    if (!this.alive || this.reachedBase) return false;

    // Update slow effects
    this.health.updateStatusEffects(deltaMs);
    this.speed = this.baseSpeed * this.health.slowFactor;

    // Follow path
    if (this.pathIndex >= this.path.length) {
      this.reachedBase = true;
      return true;
    }

    const target = this.path[this.pathIndex];
    const reached = this.position.moveToward(target.x, target.y, this.speed, deltaMs / 1000);

    if (reached) {
      this.pathIndex++;
    }

    // Update visual
    this.updateVisuals();

    // Pulse effect when slowed
    if (this.health.slowFactor < 1.0) {
      this.pulseTimer += deltaMs;
      if (this.sprite) {
        const scale = 1 + Math.sin(this.pulseTimer * 0.01) * 0.1;
        this.sprite.setScale(scale);
      }
    }

    return false;
  }

  private updateVisuals(): void {
    if (this.sprite) {
      this.sprite.setPosition(this.position.x, this.position.y);

      // Flip sprite based on horizontal direction
      if (this.pathIndex < this.path.length) {
        const target = this.path[this.pathIndex];
        const dx = target.x - this.position.x;
        if (dx < 0) {
          this.sprite.setFlipX(true);
        } else if (dx > 0) {
          this.sprite.setFlipX(false);
        }
      }
    }

    if (this.healthBarBg) {
      this.healthBarBg.setPosition(
        this.position.x,
        this.position.y - this.data.size - 6,
      );
    }

    if (this.healthBar) {
      const hpPercent = this.health.getHealthPercent();
      this.healthBar.setPosition(
        this.position.x - this.data.size,
        this.position.y - this.data.size - 6,
      );
      this.healthBar.setSize(this.data.size * 2 * hpPercent, 4);

      // Color based on health
      if (hpPercent > 0.6) {
        this.healthBar.setFillStyle(0x4CAF50);
      } else if (hpPercent > 0.3) {
        this.healthBar.setFillStyle(0xFFC107);
      } else {
        this.healthBar.setFillStyle(0xe74c3c);
      }
    }
  }

  isDead(): boolean {
    return this.health.isDead();
  }

  hasReachedBase(): boolean {
    return this.reachedBase;
  }

  kill(): void {
    this.alive = false;
    this.health.current = 0;
  }

  destroy(): void {
    this.sprite?.destroy();
    this.healthBar?.destroy();
    this.healthBarBg?.destroy();
    this.sprite = null;
    this.healthBar = null;
    this.healthBarBg = null;
  }

  /**
   * Reset for object pooling.
   */
  reset(type: EnemyType, path: { x: number; y: number }[]): void {
    this.type = type;
    this.data = ENEMY_DEFINITIONS[type];
    this.path = path;
    this.pathIndex = 0;
    this.baseSpeed = this.data.speed;
    this.speed = this.data.speed;
    this.position.set(path[0].x, path[0].y);
    this.health.reset(this.data.hp, this.data.armor);
    this.alive = true;
    this.reachedBase = false;
    this.pulseTimer = 0;
  }
}
