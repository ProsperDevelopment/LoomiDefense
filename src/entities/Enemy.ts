import Phaser from 'phaser';
import type { EnemyType, EnemyData } from '../types';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import { Position } from '../components/Position';
import { Health } from '../components/Health';

/**
 * Enemy type to sprite and animation mapping
 * Using Ninja Adventure Asset Pack monsters
 */
const ENEMY_SPRITES: Record<EnemyType, { key: string; anim: string }> = {
  basic: { key: 'enemy_slime', anim: 'slime_walk' },
  fast: { key: 'enemy_spider', anim: 'spider_walk' },
  armored: { key: 'enemy_bear', anim: 'bear_walk' },
  healer: { key: 'enemy_snake', anim: 'snake_walk' },
  swarm: { key: 'enemy_slime', anim: 'slime_walk' },
  tank: { key: 'enemy_beast', anim: 'beast_walk' },
  elite: { key: 'enemy_cyclops', anim: 'cyclops_walk' },
  boss: { key: 'enemy_dragon', anim: 'dragon_walk' },
  brute: { key: 'enemy_beast', anim: 'beast_walk' },
  sprinter: { key: 'enemy_snake', anim: 'snake_walk' },
  phantom: { key: 'enemy_dragon', anim: 'dragon_walk' },
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
  /** Visibility pulse tween for invisible enemies (phantoms). */
  private invisibilityTween: Phaser.Tweens.Tween | null = null;
  /** Hit impact: knockback offset (eases back to 0) + stagger timer. */
  private impactOffset = { x: 0, y: 0 };
  private impactTween: Phaser.Tweens.Tween | null = null;
  private staggerMs = 0;
  /** Last movement delta (set by refresh() during multiplayer sync). */
  private netFacing: { dx: number; dy: number } | null = null;

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
    sprite.play(spriteInfo.anim);
    sprite.setDepth(14); // over ground/blood/bg tiles (11/10), under fg tiles (20)
    this.sprite = sprite;

    // Health bar background
    this.healthBarBg = scene.add.rectangle(
      this.position.x,
      this.position.y - this.data.size - 6,
      this.data.size * 2,
      4,
      0x333333,
    );
    this.healthBarBg.setDepth(16);

    // Health bar
    this.healthBar = scene.add.rectangle(
      this.position.x,
      this.position.y - this.data.size - 6,
      this.data.size * 2,
      4,
      0x4CAF50,
    );
    this.healthBar.setOrigin(0, 0.5);
    this.healthBar.setDepth(17);

    // Invisible enemies (Phantoms) pulse from half transparent to fully
    // invisible and back while traveling — the flicker is the only visual
    // giveaway; blood splatter reveals their exact position on hits
    if (this.data.invisible) {
      sprite.setAlpha(0.5);
      this.invisibilityTween = scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 2000,
        ease: 'Linear',
        yoyo: true,
        repeat: -1,
      });
      this.healthBarBg.setVisible(false);
      this.healthBar.setVisible(false);
    }
  }

  /**
   * A hit pushes the enemy around: knockback along the hit direction
   * that eases back onto the path, plus a short stagger that slows its
   * movement — so the impact the hit makes is visible.
   */
  applyImpact(dirX: number, dirY: number, strength: number = 6): void {
    const len = Math.hypot(dirX, dirY);
    if (len > 0.001 && this.scene && this.sprite) {
      this.impactTween?.stop();
      this.impactOffset.x = (dirX / len) * strength;
      this.impactOffset.y = (dirY / len) * strength;
      this.impactTween = this.scene.tweens.add({
        targets: this.impactOffset,
        x: 0,
        y: 0,
        duration: 240,
        ease: 'Power2.out',
      });
    }
    this.staggerMs = Math.max(this.staggerMs, 180);
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
    // A recent hit staggers movement briefly so the impact reads
    let moveSpeed = this.speed;
    if (this.staggerMs > 0) {
      this.staggerMs = Math.max(0, this.staggerMs - deltaMs);
      moveSpeed *= 0.25;
    }
    const reached = this.position.moveToward(target.x, target.y, moveSpeed, deltaMs / 1000);

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
    const vx = this.position.x + this.impactOffset.x;
    const vy = this.position.y + this.impactOffset.y;
    if (this.sprite) {
      this.sprite.setPosition(vx, vy);

      // Play correct animation based on movement direction.
      // Multiplayer guests face the direction of network movement;
      // hosts/solo face the next path waypoint.
      let dx: number | null = null;
      let dy: number | null = null;
      if (this.netFacing) {
        dx = this.netFacing.dx;
        dy = this.netFacing.dy;
      } else if (this.pathIndex < this.path.length) {
        const target = this.path[this.pathIndex];
        dx = target.x - this.position.x;
        dy = target.y - this.position.y;
      }

      if (dx !== null && dy !== null && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        const spriteInfo = ENEMY_SPRITES[this.type];
        let animKey = `${spriteInfo.key.replace('enemy_', '')}_walk`;

        if (Math.abs(dx) > Math.abs(dy)) {
          // Moving horizontally
          animKey = dx > 0 ? `${spriteInfo.key.replace('enemy_', '')}_right` : `${spriteInfo.key.replace('enemy_', '')}_left`;
        } else if (dy < 0) {
          // Moving up
          animKey = `${spriteInfo.key.replace('enemy_', '')}_up`;
        }

        if (this.sprite.anims.currentAnim?.key !== animKey) {
          this.sprite.play(animKey);
        }
      }
    }

    if (this.healthBarBg) {
      this.healthBarBg.setPosition(
        vx,
        vy - this.data.size - 6,
      );
    }

    if (this.healthBar) {
      const hpPercent = this.health.getHealthPercent();
      this.healthBar.setPosition(
        vx - this.data.size,
        vy - this.data.size - 6,
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

  /** Re-render sprites from the current position (used by multiplayer sync). */
  refresh(): void {
    // Derive facing from the movement delta since the last render
    if (this.sprite) {
      const dx = this.position.x - this.sprite.x;
      const dy = this.position.y - this.sprite.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        this.netFacing = { dx, dy };
      }
    }
    this.updateVisuals();
  }

  hasReachedBase(): boolean {
    return this.reachedBase;
  }

  kill(): void {
    this.alive = false;
    this.health.current = 0;
  }

  destroy(): void {
    // The pulse tween repeats forever — stop it or it outlives the sprite
    this.invisibilityTween?.stop();
    this.invisibilityTween = null;
    this.impactTween?.stop();
    this.impactTween = null;
    this.impactOffset.x = 0;
    this.impactOffset.y = 0;
    this.staggerMs = 0;
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
    this.invisibilityTween = null;
    this.impactTween?.stop();
    this.impactTween = null;
    this.impactOffset.x = 0;
    this.impactOffset.y = 0;
    this.staggerMs = 0;
    this.netFacing = null;
  }
}
