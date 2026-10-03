import Phaser from 'phaser';
import type { EnemyType, EnemyData } from '../types';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import { Position } from '../components/Position';
import { Health } from '../components/Health';

/**
 * Enemy type to sprite and animation mapping
 * Using Ninja Adventure Asset Pack monsters
 */
/** Splitter: ms between bursts and how long it freezes before bursting. */
const SPLIT_INTERVAL_MS = 20000;
const SPLIT_STOP_MS = 2000;

const ENEMY_SPRITES: Record<EnemyType, { key: string; anim: string }> = {
  basic: { key: 'enemy_slime', anim: 'slime_walk' },
  fast: { key: 'enemy_spider', anim: 'spider_walk' },
  armored: { key: 'enemy_bear', anim: 'bear_walk' },
  healer: { key: 'enemy_snake', anim: 'snake_walk' },
  swarm: { key: 'enemy_slime', anim: 'slime_walk' },
  tank: { key: 'enemy_beast', anim: 'beast_walk' },
  elite: { key: 'enemy_cyclops', anim: 'cyclops_walk' },
  boss: { key: 'enemy_dragon', anim: 'dragon_walk' },
  brute: { key: 'enemy_racoon', anim: 'racoon_walk' },
  sprinter: { key: 'enemy_owl', anim: 'owl_walk' },
  phantom: { key: 'enemy_spirit', anim: 'spirit_walk' },
  splitter: { key: 'enemy_mushroom', anim: 'mushroom_walk' },
  bat: { key: 'enemy_bat', anim: 'bat_walk' },
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
  /** Hit stagger: brief movement slowdown after taking a hit. */
  private staggerMs = 0;
  /** Mini copies (spawned by a splitter) are smaller and never split. */
  isMini: boolean = false;
  private canSplit: boolean = false;
  private visualScale: number = 1;
  /** Splitter cycle: walks, stops dead for 2s, then bursts into minis. */
  private splitTimer: number = SPLIT_INTERVAL_MS;
  private splitStopMs: number = 0;
  private splitReady: boolean = false;
  /** Last movement delta (set by refresh() during multiplayer sync). */
  private netFacing: { dx: number; dy: number } | null = null;

  constructor(type: EnemyType, path: { x: number; y: number }[], id?: string, opts?: { mini?: boolean }) {
    this.type = type;
    const base = ENEMY_DEFINITIONS[type];
    this.isMini = opts?.mini === true;
    // Minis are weaker, quicker, half-size copies of the parent
    this.data = this.isMini
      ? {
          ...base,
          hp: Math.max(1, Math.round(base.hp * 0.25)),
          armor: Math.max(0, base.armor - 3),
          speed: base.speed + 25,
          size: Math.max(8, Math.round(base.size * 0.5)),
          reward: Math.max(1, Math.round(base.reward * 0.5)),
        }
      : base;
    this.canSplit = this.type === 'splitter' && !this.isMini;
    this.visualScale = this.isMini ? 0.55 : 1;
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
    if (this.visualScale !== 1) sprite.setScale(this.visualScale);
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
   * A hit staggers the enemy: movement briefly slows so the impact
   * reads without shoving the sprite off its path.
   */
  applyImpact(): void {
    this.staggerMs = Math.max(this.staggerMs, 180);
  }

  /** Stop the phantom visibility pulse (death animations take over). */
  stopInvisibilityPulse(): void {
    this.invisibilityTween?.stop();
    this.invisibilityTween = null;
  }

  /** True once per completed stop — the host spawns the minis then. */
  consumeSplitRequest(): boolean {
    if (!this.splitReady) return false;
    this.splitReady = false;
    return true;
  }

  /** Continue from another enemy's spot in the path (splitter minis). */
  syncPathProgressFrom(other: Enemy): void {
    this.pathIndex = other.pathIndex;
  }

  /**
   * Unit direction the enemy is travelling right now — the way its
   * corpse keeps gliding when it dies (falls back to the last network
   * movement, then straight right).
   */
  currentDirection(): { x: number; y: number } {
    const target = this.path[this.pathIndex];
    if (target) {
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.01) return { x: dx / len, y: dy / len };
    }
    if (this.netFacing) {
      const len = Math.hypot(this.netFacing.dx, this.netFacing.dy);
      if (len > 0.01) return { x: this.netFacing.dx / len, y: this.netFacing.dy / len };
    }
    return { x: 1, y: 0 };
  }

  /**
   * Update enemy position along the path.
   */
  update(deltaMs: number): boolean {
    if (!this.alive || this.reachedBase) return false;

    // Update slow effects
    this.health.updateStatusEffects(deltaMs);
    this.speed = this.baseSpeed * this.health.slowFactor;

    // Splitter: every 20s it stops dead for 2s, then bursts into minis
    if (this.splitStopMs > 0) {
      this.splitStopMs -= deltaMs;
      if (this.splitStopMs <= 0) {
        // Stop over — the host spawns the minis, then it walks on
        this.splitStopMs = 0;
        this.splitReady = true;
        this.splitTimer = SPLIT_INTERVAL_MS;
        this.sprite?.anims.resume();
      } else {
        this.updateVisuals();
        return false;
      }
    } else if (this.canSplit) {
      this.splitTimer -= deltaMs;
      if (this.splitTimer <= 0) {
        this.splitStopMs = SPLIT_STOP_MS;
        this.sprite?.anims.pause();
        this.updateVisuals();
        return false;
      }
    }

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
        const scale = this.visualScale * (1 + Math.sin(this.pulseTimer * 0.01) * 0.1);
        this.sprite.setScale(scale);
      }
    }

    return false;
  }

  private updateVisuals(): void {
    if (this.sprite) {
      this.sprite.setPosition(this.position.x, this.position.y);

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
    this.staggerMs = 0;
    this.netFacing = null;
  }
}
