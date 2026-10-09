import Phaser from 'phaser';
import type { Enemy } from '../entities/Enemy';
import type { Tower } from '../entities/Tower';
import type { Grid } from '../utils/Grid';
import { Position } from '../components/Position';
import type { DeathVariant } from '../../shared/protocol';
import { CELL_SIZE } from '../config/constants';
import { playSfx } from '../audio/GameAudio';
import { lobby } from '../ui/overlay/lobbyScreen';
import { eventBus } from '../utils/EventBus';

/** Bodies that share the blood landing pipeline (blood arcs, death debris images). */
type SplatterBody = Phaser.GameObjects.Arc | Phaser.GameObjects.Image;

/** Weight-based blood volume tier for death splatters. */
export function deathSplatterTier(weight: number): number {
  if (weight < 50) return 1;
  if (weight < 120) return 2;
  if (weight < 350) return 3;
  if (weight < 900) return 4;
  return 5;
}

/**
 * Interface for the parts of GameScene that DeathEffects needs.
 * Avoids a circular import and keeps the dependency surface explicit.
 */
export interface DeathEffectsHost {
  tweens: Phaser.Tweens.TweenManager;
  time: Phaser.Time.Clock;
  add: Phaser.GameObjects.GameObjectFactory;
  grid: Grid;
  enemies: Enemy[];
  towers: Tower[];
  selectedEnemy: Enemy | null;
  guestEnemyTargets: Map<string, { x: number; y: number }>;
  netRole: 'host' | 'guest' | null;
  restingDebris: { img: Phaser.GameObjects.Image; cooldown: number }[];
  recentSplats: number[];
  deselectEnemy(): void;
  detachEnemy(enemy: Enemy): void;
}

/**
 * Death effects system — blood splatter, death animations, debris,
 * skeletons, glide physics.
 *
 * Extracted from GameScene to keep it under control.
 */
export class DeathEffects {
  constructor(private scene: DeathEffectsHost & Phaser.Scene) {}

  // ── helpers ──────────────────────────────────────────────────

  dripEndY(x: number, y: number): number | null {
    return this.scene.grid.areaBottomY(x, y) ?? this.scene.grid.towerBottomY(x, y);
  }

  updateDebrisKicks(deltaMs: number): void {
    if (this.scene.restingDebris.length === 0) return;
    for (const b of this.scene.restingDebris) {
      if (!b.img.active) continue;
      if (b.cooldown > 0) {
        b.cooldown -= deltaMs;
        continue;
      }
      const enemy = this.scene.enemies.find(
        (e) =>
          e.alive &&
          !e.isDead() &&
          Math.hypot(e.position.x - b.img.x, e.position.y - b.img.y) <= e.data.size * 0.7 + 6,
      );
      if (enemy) {
        b.cooldown = 700; // one kick per pass
        // Bumping corpse debris switches collision physics on briefly
        enemy.physicsMs = 500;
        this.kickDebris(b.img, enemy.position.x, enemy.position.y);
      }
    }
    // Drop pieces that finished fading
    if (this.scene.restingDebris.some((b) => !b.img.active)) {
      this.scene.restingDebris = this.scene.restingDebris.filter((b) => b.img.active);
    }
  }

  kickDebris(bone: Phaser.GameObjects.Image, fromX: number, fromY: number): void {
    const dx = bone.x - fromX;
    const dy = bone.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const push = 6 + Math.random() * 5;
    const nx = (dx / len) * push;
    const ny = (dy / len) * push;
    const spin = (Math.random() - 0.5) * 80;
    this.scene.tweens.add({
      targets: bone,
      x: bone.x + nx,
      y: bone.y + ny - 4,
      angle: bone.angle + spin,
      duration: 120,
      ease: 'Power1.out',
      onComplete: () => {
        if (!bone.active) return;
        this.scene.tweens.add({
          targets: bone,
          y: bone.y + 4,
          duration: 140,
          ease: 'Power1.in',
        });
      },
    });
  }


  dripDown(target: SplatterBody, targetY: number, distance: number, then: () => void): void {
    this.scene.tweens.add({
      targets: target,
      y: targetY,
      rotation: 0,
      scaleX: 0.75,
      scaleY: 1.6,
      duration: Math.min(3500, 400 + distance * 6),
      ease: 'Power1.in',
      onComplete: then,
    });
  }

  landDebris(
    piece: Phaser.GameObjects.Image,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    bounceCount: number,
    persist: boolean = false,
  ): void {
    const fade = () => {
      if (!piece.active) return;
      const start = () => {
        this.scene.tweens.add({
          targets: piece,
          alpha: 0,
          duration: 5000,
          onComplete: () => {
            if (piece.active) piece.destroy();
          },
        });
      };
      // Register with the kick system: living enemies shove corpse
      // parts (bones and shards alike) around while they're visible
      this.scene.restingDebris.push({ img: piece, cooldown: 0 });
      if (persist) {
        // Bones lie on the ground for 30 seconds before fading away
        this.scene.time.delayedCall(30000, start);
      } else {
        start();
      }
    };

    // Bounce and roll in the direction the piece was already travelling —
    // it keeps moving the way it came in. Far-flung pieces skitter with
    // extra, decaying bounces before settling and fading
    const bounceOnGround = (): void => {
      const roll = 5 + Math.random() * 8;
      const rollPerBounce = roll / bounceCount;
      let hop = 3 + Math.random() * 4;
      let bounced = 0;

      const afterLanding = (): void => {
        if (bounced < bounceCount) {
          hop *= 0.55; // each extra bounce decays
          doBounce();
        } else {
          fade();
        }
      };

      const doBounce = () => {
        if (!piece.active) return;
        bounced++;
        this.scene.tweens.add({
          targets: piece,
          x: piece.x + dirX * rollPerBounce * 0.5,
          y: piece.y + dirY * rollPerBounce * 0.5 - hop,
          angle: piece.angle + (Math.random() - 0.5) * 45,
          duration: 150,
          ease: 'Power1.out',
          onComplete: () => {
            if (!piece.active) return;
            this.scene.tweens.add({
              targets: piece,
              x: piece.x + dirX * rollPerBounce * 0.5,
              y: piece.y + dirY * rollPerBounce * 0.5 + hop,
              angle: piece.angle + (Math.random() - 0.5) * 30,
              duration: 190,
              ease: 'Power1.in',
              onComplete: () => {
                if (!piece.active) return;
                // Bounced onto a tower — glide down to the ground under it
                const landed = this.scene.grid.towerNear(piece.x, piece.y, CELL_SIZE / 2);
                if (landed) {
                  this.glideOffTower(piece, landed, afterLanding);
                } else {
                  afterLanding();
                }
              },
            });
          },
        });
      };
      doBounce();
    };

    // Towers: glide straight down to the ground under the tower,
    // then land like it dropped off the structure
    const tower = this.scene.grid.towerNear(piece.x, piece.y, CELL_SIZE / 2);
    if (tower) {
      this.glideOffTower(piece, tower, bounceOnGround);
      return;
    }

    // Walls and trees: glide down the face to the base
    const endY = this.scene.grid.areaBottomY(x, y);
    if (endY !== null) {
      const distance = endY - y;
      if (distance >= 4) {
        this.dripDown(piece, endY, distance, fade);
      } else {
        fade();
      }
      return;
    }

    // Open ground
    bounceOnGround();
  }

  createBloodSplatter(dirX: number, dirY: number, hitPos: Position, enemySize: number, bloodSize: number): void {
    // Base angle of the projectile's travel direction
    const hitAngle = Math.atan2(dirY, dirX);

    // Lots of blood already on screen? Then no fine spray this time
    const now = this.scene.time.now;
    this.scene.recentSplats = this.scene.recentSplats.filter((t) => now - t < 900);
    const heavySplatter = this.scene.recentSplats.length >= 4;
    this.scene.recentSplats.push(now);

    // Number of particles
    const particleCount = 3 + bloodSize * 3;

    /**
     * Landing sequence: on an object, run down to its base → spread into
     * a pool there → dry dark and fade out (slowly, so splatters linger).
     * On open ground, dry in place.
     */
    const settle = (particle: Phaser.GameObjects.Arc, x: number, y: number, fadeMs: number): void => {
      const dry = () => {
        if (!particle.active) return;
        particle.setFillStyle(0x4a0000, 0.8);
        this.scene.tweens.add({
          targets: particle,
          alpha: 0,
          duration: fadeMs,
          onComplete: () => {
            if (particle.active) particle.destroy();
          },
        });
      };

      // Every landing ends in an oval pool, slightly different per splat.
      // The vertical-drip → pool change is instant (no morph); a few
      // pixel-sized drips scatter in an oval around it, then all dry.
      const formPool = (poolX: number, poolY: number) => {
        if (!particle.active) return;

        // Instant: snap straight out of the drip into the pool, on the
        // blood layer (depth 21 — above foreground tiles)
        const poolSX = 1.35 + Math.random() * 0.45;
        const poolSY = 0.55 + Math.random() * 0.15;
        particle.setDepth(21);
        particle.setPosition(poolX, poolY);
        particle.rotation = 0;
        particle.setScale(poolSX, poolSY);

        // Ejecta: irregular angles and staggered distances so the spray
        // reads as an explosion flung out of the pool — each drop streaked
        // along its flight path and popping outward. Sized to never render
        // under 2x2 (radius 1.5+ x scaleY 0.7+ = 2.1px minimum).
        const rx = particle.radius * poolSX * 2.2;
        const ry = particle.radius * poolSY * 1.4;
        const dropCount = 2 + Math.floor(Math.random() * 3);
        const drops: Phaser.GameObjects.Arc[] = [];
        for (let d = 0; d < dropCount; d++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.9 + Math.random() * 1.1; // 0.9-2.0x: close and flung
          const startX = poolX + Math.cos(angle) * rx * 0.4;
          const startY = poolY + Math.sin(angle) * ry * 0.4;
          const endX = poolX + Math.cos(angle) * rx * dist;
          const endY = poolY + Math.sin(angle) * ry * dist;
          const drop = this.scene.add.circle(
            startX, startY,
            1.5 + Math.random() * 0.7,
            0xcc0000,
            particle.alpha,
          );
          drop.setDepth(21);
          drop.rotation = Math.atan2(endY - startY, endX - startX);
          drop.setScale(1.5 + Math.random() * 0.6, 0.7 + Math.random() * 0.15);
          this.scene.tweens.add({
            targets: drop,
            x: endX,
            y: endY,
            duration: 160 + Math.random() * 100,
            ease: 'Power3.out',
          });
          drops.push(drop);
        }

        // Let the fresh pool read for a beat, then dry together
        this.scene.time.delayedCall(300, () => {
          dry();
          for (const drop of drops) {
            if (!drop.active) continue;
            drop.setFillStyle(0x4a0000, 0.8);
            this.scene.tweens.add({
              targets: drop,
              alpha: 0,
              duration: fadeMs * (0.6 + Math.random() * 0.4),
              onComplete: () => {
                if (drop.active) drop.destroy();
              },
            });
          }
        });
      };

      const endY = this.dripEndY(x, y);
      if (endY === null) {
        // Open ground: drip vertical for a moment just before landing,
        // then end in a pool where it stops
        const run = 10 + Math.random() * 26;
        this.dripDown(particle, y + run, run, () => {
          if (particle.active) formPool(x, y + run);
        });
        return;
      }

      // Small particles hitting an object skip the drip/pool entirely —
      // they leave a scatter of speckles on its face that dry in place
      if (particle.radius < 3) {
        const dots: Phaser.GameObjects.Arc[] = [];
        const speckCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < speckCount; i++) {
          const dot = this.scene.add.circle(
            x + (Math.random() - 0.5) * 10,
            y + (Math.random() - 0.5) * 10,
            1 + Math.random() * 0.6,
            0xcc0000,
            particle.alpha,
          );
          dot.setDepth(21); // on the object's face
          dots.push(dot);
        }
        this.scene.time.delayedCall(300, () => {
          dry();
          for (const dot of dots) {
            if (!dot.active) continue;
            dot.setFillStyle(0x4a0000, 0.8);
            this.scene.tweens.add({
              targets: dot,
              alpha: 0,
              duration: fadeMs * (0.6 + Math.random() * 0.4),
              onComplete: () => {
                if (dot.active) dot.destroy();
              },
            });
          }
        });
        return;
      }

      const distance = endY - y;
      if (distance < 4) {
        // Already at the object's base — pool at its foot
        formPool(x, endY + 2);
        return;
      }

      // Run down the whole object, then pool at the foot
      this.dripDown(particle, endY, distance, () => formPool(x, endY + 2));
    };

    for (let i = 0; i < particleCount; i++) {
      const size = (2 + bloodSize) + Math.random() * 2;
      const particle = this.scene.add.circle(
        hitPos.x,
        hitPos.y,
        size,
        0xcc0000,
        1,
      );
      particle.setDepth(21);

      // Random spread around the projectile's travel direction.
      // Irregular distance: only on death splatters (bloodSize >= 3),
      // ~8% chance of a far spray simulating arterial burst
      const angle = hitAngle + (Math.random() - 0.5) * 1.5;
      const baseSpeed = 35 + Math.random() * 55;
      const farFling = bloodSize >= 3 && Math.random() < 0.08;
      const speed = baseSpeed * (farFling ? 1.8 + Math.random() * 0.7 : 1);
      const targetX = hitPos.x + Math.cos(angle) * speed;
      const targetY = hitPos.y + Math.sin(angle) * speed;

      // Born circular, stretched into an oval along the flight direction
      particle.rotation = angle;
      this.scene.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        alpha: 0.6,
        scaleX: 1.9 + Math.random() * 0.7,
        scaleY: 0.55 + Math.random() * 0.25,
        duration: 300 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => {
          if (particle.active) settle(particle, targetX, targetY, 5000);
        },
      });

      // Also spawn exit blood (opposite direction, fewer particles)
      if (bloodSize > 0 && i < 2) {
        const exitAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        const exitBase = 18 + Math.random() * 32;
        const exitFar = bloodSize >= 3 && Math.random() < 0.06;
        const exitSpeed = exitBase * (exitFar ? 2.0 + Math.random() * 0.6 : 1);
        const exitTargetX = hitPos.x + Math.cos(exitAngle) * exitSpeed;
        const exitTargetY = hitPos.y + Math.sin(exitAngle) * exitSpeed;
        const exitParticle = this.scene.add.circle(
          hitPos.x,
          hitPos.y,
          (1 + bloodSize) + Math.random() * (2 + bloodSize),
          0xcc0000,
          1,
        );
        exitParticle.setDepth(21);

        exitParticle.rotation = exitAngle;
        this.scene.tweens.add({
          targets: exitParticle,
          x: exitTargetX,
          y: exitTargetY,
          alpha: 0.4,
          scaleX: 1.7 + Math.random() * 0.6,
          scaleY: 0.55 + Math.random() * 0.2,
          duration: 250,
          ease: 'Power2',
          onComplete: () => {
            if (exitParticle.active) settle(exitParticle, exitTargetX, exitTargetY, 4000);
          },
        });
      }
    }

    // Fine spray: pixel-sized particles from the very start of the
    // lifecycle — born at the hit, they fly, drip and pool like the
    // rest, but only when the screen isn't already full of blood
    const speckCount = heavySplatter ? 0 : 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < speckCount; i++) {
      const angle = hitAngle + (Math.random() - 0.5) * 2.4; // wider spread
      const speed = 25 + Math.random() * 60;
      const targetX = hitPos.x + Math.cos(angle) * speed;
      const targetY = hitPos.y + Math.sin(angle) * speed;
      const speck = this.scene.add.circle(hitPos.x, hitPos.y, 1.85 + Math.random() * 0.5, 0xcc0000, 1);
      speck.setDepth(21);
      speck.rotation = angle;
      this.scene.tweens.add({
        targets: speck,
        x: targetX,
        y: targetY,
        alpha: 0.6,
        scaleX: 1.6 + Math.random() * 0.8,
        scaleY: 0.6 + Math.random() * 0.3,
        duration: 260 + Math.random() * 240,
        ease: 'Power2',
        onComplete: () => {
          if (speck.active) settle(speck, targetX, targetY, 3500);
        },
      });
    }
  }

  createImmuneIndicator(x: number, y: number): void {
    const text = this.scene.add.text(x, y - 20, 'IMMUNE', {
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    this.scene.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      onComplete: () => text.destroy(),
    });
  }

  onEnemyKilled(enemy: Enemy, ownerId?: string | null, dir?: { x: number; y: number }): void {
    // Guard: a kill must only be processed once (damage systems can
    // report the same enemy through multiple paths in one frame).
    if (!enemy.alive) return;
    enemy.alive = false;
    // Cancel any in-flight hit reaction so the corpse starts on the path
    this.scene.tweens.killTweensOf(enemy);
    enemy.fxX = 0;
    enemy.fxY = 0;
    enemy.fxRotation = 0;
    enemy.animOverride = null;
    enemy.sprite?.setPosition(enemy.position.x, enemy.position.y);

    // Clear selection if this enemy was selected
    if (this.scene.selectedEnemy === enemy) {
      this.scene.deselectEnemy();
    }
    const reward = enemy.data.reward;
    const { x, y } = enemy.position;
    this.createDeathEffect(x, y, enemy.data.color);
    // Death splatter volume comes from the body's weight
    const d = dir ?? enemy.currentDirection();
    this.createBloodSplatter(d.x, d.y, enemy.position, enemy.data.size, deathSplatterTier(enemy.weight));
    playSfx(this.scene, 'sfx_splat', { volume: 0.4, rate: 0.9 + Math.random() * 0.3 });

    // Detach from the list immediately (wave completion checks it) —
    // each death variant owns the corpse sprite from here on
    this.scene.detachEnemy(enemy);
    enemy.healthBar?.setVisible(false);
    enemy.healthBarBg?.setVisible(false);

    // Three death animations, picked once so every peer plays the same
    // one: bleed out, tip over and explode, or the plain sprite burst.
    const variant = this.pickDeathVariant(enemy);
    this.playDeathVariant(enemy, variant);
    // Tell the guests so their copy of this enemy plays the same one
    if (this.scene.netRole === 'host') {
      lobby.sendNet({ kind: 'died', id: enemy.id, variant });
    }

    eventBus.emit('enemy-killed', { enemyType: enemy.type, reward, x, y, ownerId: ownerId ?? undefined });
  }

  pickDeathVariant(enemy: Enemy): DeathVariant {
    if (enemy.data.invisible) return Math.random() < 0.5 ? 'tip' : 'burst';
    const roll = Math.random();
    return roll < 1 / 3 ? 'bleed' : roll < 2 / 3 ? 'tip' : 'burst';
  }

  onNinjaKilled(ninja: Enemy, dir?: { x: number; y: number }): void {
    if (!ninja.alive) return;
    ninja.alive = false;
    this.scene.tweens.killTweensOf(ninja);
    ninja.fxX = 0;
    ninja.fxY = 0;
    ninja.fxRotation = 0;
    ninja.animOverride = null;
    ninja.sprite?.setPosition(ninja.position.x, ninja.position.y);
    if (this.scene.selectedEnemy === ninja) this.scene.deselectEnemy();
    this.scene.detachEnemy(ninja);
    ninja.healthBar?.setVisible(false);
    ninja.healthBarBg?.setVisible(false);
    const d = dir ?? ninja.currentDirection();
    this.createBloodSplatter(d.x, d.y, ninja.position, ninja.data.size, deathSplatterTier(ninja.weight));
    playSfx(this.scene, 'sfx_splat', { volume: 0.4, rate: 0.9 + Math.random() * 0.3 });
    const variant = this.pickDeathVariant(ninja);
    this.playDeathVariant(ninja, variant);
    if (this.scene.netRole === 'host') {
      lobby.sendNet({ kind: 'died', id: ninja.id, variant });
    }
  }

  playDeathVariant(enemy: Enemy, variant: DeathVariant): void {
    switch (variant) {
      case 'bleed':
        this.deathBleedOut(enemy);
        break;
      case 'tip':
        this.deathTipOver(enemy);
        break;
      default:
        this.explodeEnemySprite(enemy);
        enemy.destroy();
    }
  }

  playGuestDeath(id: string, variant: DeathVariant): void {
    const enemy = this.scene.enemies.find((e) => e.id === id && e.alive);
    if (!enemy) return;
    enemy.alive = false;
    if (this.scene.selectedEnemy === enemy) this.scene.deselectEnemy();
    this.scene.guestEnemyTargets.delete(id);
    // Detach now — the animation owns the corpse, exactly like the host
    this.scene.detachEnemy(enemy);
    this.playDeathVariant(enemy, variant);
  }

  onEnemyKilledById(id: string, ownerId?: string | null, dir?: { x: number; y: number }): void {
    const enemy = this.scene.enemies.find(e => e.id === id && e.alive);
    if (enemy) this.onEnemyKilled(enemy, ownerId, dir);
  }

  glideObstacleAt(x: number, y: number, selfSize: number): { cx: number; cy: number } | null {
    const { col, row } = this.scene.grid.worldToBgGrid(x, y);
    const area = this.scene.grid.getArea(col, row);
    if (area === 'tree' || area === 'wall') {
      const cell = this.scene.grid.bgToWorld(col, row);
      return { cx: cell.x, cy: cell.y };
    }
    for (const t of this.scene.towers) {
      if (Math.hypot(t.position.x - x, t.position.y - y) < CELL_SIZE * 0.5 + selfSize * 0.4) {
        return { cx: t.position.x, cy: t.position.y };
      }
    }
    for (const e of this.scene.enemies) {
      if (!e.alive || e.isDead()) continue;
      if (Math.hypot(e.position.x - x, e.position.y - y) < e.data.size + selfSize * 0.5) {
        return { cx: e.position.x, cy: e.position.y };
      }
    }
    return null;
  }

  enableCorpsePush(enemy: Enemy, sprite: Phaser.GameObjects.Image, onMove?: () => void): void {
    const size = enemy.data.size;
    const vel = { x: 0, y: 0 };
    let stopping = false;
    let gliding = false;

    const event = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (stopping || !sprite.active) {
          event.remove();
          return;
        }
        if (gliding) return; // tower glide in progress
        let moved = false;

        // Running enemies shove the corpse out of their way
        for (const e of this.scene.enemies) {
          if (!e.alive || e.isDead()) continue;
          const dx = sprite.x - e.position.x;
          const dy = sprite.y - e.position.y;
          const dist = Math.hypot(dx, dy);
          const reach = e.data.size + size * 0.5;
          if (dist < reach && dist > 0.01) {
            const nx = dx / dist;
            const ny = dy / dist;
            const depth = Math.min(reach - dist, 3);
            sprite.x += nx * depth;
            sprite.y += ny * depth;
            moved = true;
            vel.x += nx * depth * 0.7;
            vel.y += ny * depth * 0.7;
            // Shoving a corpse switches collision physics on briefly
            e.physicsMs = 500;
          }
        }

        // Shoved onto a tower? Glide down to the ground under it —
        // physics pauses until the glide lands
        const tower = this.scene.grid.towerNear(sprite.x, sprite.y, CELL_SIZE * 0.4);
        if (tower) {
          gliding = true;
          vel.x = 0;
          vel.y = 0;
          this.glideOffTower(sprite, tower, () => {
            gliding = false;
            onMove?.();
          });
          if (moved) onMove?.();
          return;
        }

        // Cap the skid speed, then move — bouncing off non-ground objects
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > 4) {
          vel.x = (vel.x / speed) * 4;
          vel.y = (vel.y / speed) * 4;
        }
        if (Math.hypot(vel.x, vel.y) > 0.02) {
          const nx = sprite.x + vel.x;
          const ny = sprite.y + vel.y;
          const obstacle = this.glideObstacleAt(nx, ny, size);
          if (obstacle) {
            // Reflect off the surface with a little damping
            const ox = nx - obstacle.cx;
            const oy = ny - obstacle.cy;
            const ol = Math.hypot(ox, oy) || 1;
            const nX = ox / ol;
            const nY = oy / ol;
            const dot = vel.x * nX + vel.y * nY;
            vel.x = (vel.x - 2 * dot * nX) * 0.7;
            vel.y = (vel.y - 2 * dot * nY) * 0.7;
          } else {
            sprite.x = nx;
            sprite.y = ny;
            moved = true;
          }
          // Friction — the skid dies out on its own
          vel.x *= 0.9;
          vel.y *= 0.9;
        }
        if (moved) onMove?.();
      },
    });

    // Rigs stop the moment the corpse starts fading (pool spread = 1400ms)
    this.scene.time.delayedCall(1450, () => {
      stopping = true;
    });
  }

  buildGlidePath(
    startX: number,
    startY: number,
    dir: { x: number; y: number },
    distance: number,
    selfSize: number,
  ): { x: number; y: number }[] {
    const pts = [{ x: startX, y: startY }];
    let px = startX;
    let py = startY;
    let dx = dir.x;
    let dy = dir.y;
    let remaining = distance;
    const step = 3;
    let bounces = 0;

    while (remaining > 0 && bounces <= 3) {
      let traveled = 0;
      let obstacle: { cx: number; cy: number } | null = null;
      while (traveled < remaining) {
        const nx = px + dx * step;
        const ny = py + dy * step;
        obstacle = this.glideObstacleAt(nx, ny, selfSize);
        if (obstacle) break;
        px = nx;
        py = ny;
        traveled += step;
      }
      remaining -= traveled;
      if (obstacle && remaining > 6) {
        pts.push({ x: px, y: py });
        // Reflect off the surface that points back at us
        const hit = obstacle;
        const nx = px - hit.cx;
        const ny = py - hit.cy;
        const nl = Math.hypot(nx, ny) || 1;
        const nX = nx / nl;
        const nY = ny / nl;
        const dirAngle = Math.atan2(dy, dx);
        const dot = dx * nX + dy * nY;
        dx = dx - 2 * dot * nX;
        dy = dy - 2 * dot * nY;
        // Glancing hits barely turn — kick the bounce so it actually
        // reads as a bounce instead of skimming through
        let turn = Math.atan2(dy, dx) - dirAngle;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        if (Math.abs(turn) < 0.45) {
          const kick = (turn === 0 ? 1 : Math.sign(turn)) * (0.45 - Math.abs(turn));
          const ca = Math.cos(kick);
          const sa = Math.sin(kick);
          const rx = dx * ca - dy * sa;
          const ry = dx * sa + dy * ca;
          dx = rx;
          dy = ry;
        }
        // Slide out of this obstacle's body along the new direction so
        // the same tower can't eat every bounce (one bounce per hit)
        const sameObstacle = (hx: number, hy: number): boolean => {
          const h = this.glideObstacleAt(hx, hy, selfSize);
          return !!h && Math.abs(h.cx - hit.cx) < 1 && Math.abs(h.cy - hit.cy) < 1;
        };
        let qx = px + dx * 2;
        let qy = py + dy * 2;
        let guard = 0;
        while (guard++ < 24 && remaining > 0 && sameObstacle(qx, qy)) {
          qx += dx * 2;
          qy += dy * 2;
          remaining -= 2;
        }
        px = qx;
        py = qy;
        bounces++;
      } else {
        px += dx * remaining;
        py += dy * remaining;
        remaining = 0;
      }
    }
    const end = { x: px, y: py };
    const last = pts[pts.length - 1];
    if (Math.hypot(end.x - last.x, end.y - last.y) > 1) pts.push(end);
    return pts;
  }

  glideOffTower(
    piece: Phaser.GameObjects.Image,
    tower: { cx: number; cy: number },
    then: () => void,
  ): void {
    const groundY = tower.cy + CELL_SIZE / 2;
    const distance = groundY - piece.y;
    if (distance < 4) {
      then();
      return;
    }
    const sx = piece.scaleX;
    const sy = piece.scaleY;
    this.dripDown(piece, groundY, distance, () => {
      if (!piece.active) return;
      piece.setScale(sx, sy); // dripDown stretches — restore the piece
      then();
    });
  }

  deathBleedOut(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) {
      enemy.destroy();
      return;
    }
    enemy.stopInvisibilityPulse();
    // Above the blood (21) for the whole death, so the corpse always
    // lies on top of its own bleed pool
    sprite.setDepth(22);

    // Glide on in the direction it was travelling when shot — bouncing
    // off trees, walls and other enemies — tumbling a full 360° as it goes
    const startDir = enemy.currentDirection();
    const jitter = (Math.random() - 0.5) * 0.3;
    const cosJ = Math.cos(jitter);
    const sinJ = Math.sin(jitter);
    const dir = {
      x: startDir.x * cosJ - startDir.y * sinJ,
      y: startDir.x * sinJ + startDir.y * cosJ,
    };
    const slide = 40 + Math.random() * 30;
    const tumble = (Math.random() < 0.5 ? -1 : 1) * 360; // one full roll, either way
    const slideMs = 700;
    const pts = this.buildGlidePath(sprite.x, sprite.y, dir, slide, enemy.data.size);

    // Arc-length position along the (possibly bouncing) path at t (0..1)
    const segLens: number[] = [];
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segLens.push(l);
      totalLen += l;
    }
    const glidePath = (t: number): { x: number; y: number } => {
      let dist = t * totalLen;
      for (let i = 0; i < segLens.length; i++) {
        if (dist <= segLens[i] || i === segLens.length - 1) {
          const u = segLens[i] > 0 ? Math.min(dist / segLens[i], 1) : 0;
          return {
            x: pts[i].x + (pts[i + 1].x - pts[i].x) * u,
            y: pts[i].y + (pts[i + 1].y - pts[i].y) * u,
          };
        }
        dist -= segLens[i];
      }
      return pts[pts.length - 1];
    };

    // Bleed from the very start: the full pattern flies out of the
    // corpse while it is still gliding (frames slow as it goes)
    this.createBloodSplatter(dir.x, dir.y, new Position(sprite.x, sprite.y), enemy.data.size, 1);

    // Small splatter spurts out of the sprite the whole time it dies
    const spurtCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < spurtCount; i++) {
      this.scene.time.delayedCall(i * 120 + Math.random() * 60, () => {
        if (sprite.active) this.bloodSpurt(sprite.x, sprite.y);
      });
    }

    // Blood dots mark the drag along the glide path — scheduled at the
    // wall-clock time the eased glide actually reaches each point
    const timeAt = (t: number): number => slideMs * (1 - Math.pow(1 - t, 1 / 5)); // inverse of Power4.out
    const traceCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < traceCount; i++) {
      const t = (i + 1) / (traceCount + 1);
      this.scene.time.delayedCall(timeAt(t), () => {
        const pt = glidePath(t);
        const dot = this.scene.add.circle(
          pt.x + (Math.random() - 0.5) * 4,
          pt.y + (Math.random() - 0.5) * 4,
          1.5 + Math.random() * 1.5,
          0xcc0000,
          0.85,
        );
        dot.setDepth(21);
        // Dry like the rest of the blood
        this.scene.time.delayedCall(400, () => {
          if (!dot.active) return;
          dot.setDepth(21);
          dot.setFillStyle(0x4a0000, 0.8);
          this.scene.tweens.add({
            targets: dot,
            alpha: 0,
            duration: 5000,
            onComplete: () => {
              if (dot.active) dot.destroy();
            },
          });
        });
      });
    }

    // One continuous glide that slows down more and more as it goes:
    // eased progress mapped along the two-leg (veering) path
    const prog = { t: 0 };

    // The walk-cycle tiles slow down in step with the glide...
    if (sprite.anims.isPlaying) {
      this.scene.tweens.add({
        targets: sprite.anims,
        timeScale: 0,
        duration: slideMs,
        ease: 'Power4.out',
      });
    }

    this.scene.tweens.add({
      targets: prog,
      t: 1,
      duration: slideMs,
      ease: 'Power4.out', // slows down fast — visibly at rest well before the fade
      onUpdate: () => {
        if (!sprite.active) return;
        const pt = glidePath(prog.t);
        sprite.setPosition(pt.x, pt.y);
        sprite.angle = tumble * prog.t; // eases with the glide, lands upright
      },
      onComplete: () => {
        if (!sprite.active) {
          enemy.destroy();
          return;
        }
        // The animation has stopped: after lying still for a second it
        // bleeds into a blood pool — no splatter, just drips and a pool
        sprite.anims.stop();
        const comeToRest = (): void => {
          let bloodPool: Phaser.GameObjects.Arc | null = null;
          this.scene.time.delayedCall(1000, () => {
            if (sprite.active) {
              bloodPool = this.bleedOutPool(sprite.x, sprite.y, enemy.data.size);
            }
          });
          // From here running enemies can shove the corpse around — and
          // the pool keeps sliding under it while it's pushed
          this.enableCorpsePush(enemy, sprite, () => {
            if (bloodPool?.active) {
              bloodPool.x = sprite.x;
              bloodPool.y = sprite.y + enemy.data.size * 0.5;
            }
          });
          // The corpse fades out alongside the blood — the same
          // 5s fade, starting as the pool begins to dry
          this.scene.tweens.add({
            targets: sprite,
            alpha: 0,
            duration: 5000,
            delay: 2400, // still second (1000) + pool spread (1400)
            onComplete: () => enemy.destroy(),
          });
        };
        // If the glide ended on a tower, glide down to the ground first
        const tower = this.scene.grid.towerNear(sprite.x, sprite.y, CELL_SIZE / 2);
        if (tower) {
          this.glideOffTower(sprite, tower, comeToRest);
        } else {
          comeToRest();
        }
      },
    });
  }

  bloodSpurt(x: number, y: number): void {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 14;
      const dot = this.scene.add.circle(x, y, 1.2 + Math.random() * 1.2, 0xcc0000, 0.95);
      dot.setDepth(21);
      dot.rotation = angle;
      this.scene.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scaleX: 1.8,
        scaleY: 0.65,
        alpha: 0.5,
        duration: 180 + Math.random() * 140,
        ease: 'Power2.out',
        onComplete: () => {
          if (!dot.active) return;
          dot.setDepth(21);
          dot.setFillStyle(0x4a0000, 0.8);
          this.scene.tweens.add({
            targets: dot,
            alpha: 0,
            duration: 4000,
            onComplete: () => {
              if (dot.active) dot.destroy();
            },
          });
        },
      });
    }
  }

  bleedOutPool(x: number, y: number, corpseSize: number): Phaser.GameObjects.Arc {
    const poolY = y + corpseSize * 0.5;
    const pool = this.scene.add.circle(x, poolY, 10 + Math.random() * 6, 0x8a0000, 1); // deep red from the start
    pool.setDepth(21);
    pool.setScale(0.1);

    // Drips fall from the corpse's center into the pool
    const dripCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < dripCount; i++) {
      this.scene.time.delayedCall(i * 130 + Math.random() * 90, () => {
        if (!pool.active) return;
        const drip = this.scene.add.circle(
          x + (Math.random() - 0.5) * 8,
          y,
          1.5 + Math.random() * 0.8,
          0xcc0000,
          0.9,
        );
        drip.setDepth(21);
        this.scene.tweens.add({
          targets: drip,
          y: poolY,
          duration: 160 + Math.random() * 140,
          ease: 'Power1.in',
          onComplete: () => {
            if (drip.active) drip.destroy();
          },
        });
      });
    }

    // The pool spreads into the familiar oval, then dries like blood
    this.scene.tweens.add({
      targets: pool,
      scaleX: 1.4 + Math.random() * 0.4,
      scaleY: 0.55 + Math.random() * 0.15,
      duration: 1400,
      ease: 'Power2.out',
      onComplete: () => {
        if (!pool.active) return;
        pool.setDepth(21);
        pool.setFillStyle(0x4a0000, 0.8);
        this.scene.tweens.add({
          targets: pool,
          alpha: 0,
          duration: 5000,
          onComplete: () => {
            if (pool.active) pool.destroy();
          },
        });
      },
    });
    return pool;
  }

  deathTipOver(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) {
      enemy.destroy();
      return;
    }
    enemy.stopInvisibilityPulse();

    const dir = Math.random() * Math.PI * 2;
    const slide = 8 + Math.random() * 10;
    const fall = (Math.random() < 0.5 ? -1 : 1) * (75 + Math.random() * 70); // random way and angle

    // 1. slide a bit off the road
    this.scene.tweens.add({
      targets: sprite,
      x: sprite.x + Math.cos(dir) * slide,
      y: sprite.y + Math.sin(dir) * slide,
      duration: 280,
      ease: 'Power1.out',
      onComplete: () => {
        if (!sprite.active) {
          enemy.destroy();
          return;
        }
        // 2. tip over
        this.scene.tweens.add({
          targets: sprite,
          angle: fall,
          duration: 180,
          ease: 'Power1.in',
          onComplete: () => {
            if (!sprite.active) {
              enemy.destroy();
              return;
            }
            // 3. explode and splatter like the usual death
            this.createBloodSplatter(
              0, 1, new Position(sprite.x, sprite.y), enemy.data.size, 3,
            );
            this.explodeEnemySprite(enemy);
            enemy.destroy();
          },
        });
      },
    });
  }

  explodeEnemySprite(enemy: Enemy): void {
    const sprite = enemy.sprite;
    if (!sprite || !sprite.active) return;
    const tex = this.scene.textures.get(sprite.texture.key);
    if (!tex) return;

    const src = sprite.frame;
    // Random split: a different number of pieces every death, cut into
    // random-sized chunks rather than an even grid
    const COLS = 2 + Math.floor(Math.random() * 3); // 2-4 -> 4..16 pieces
    const ROWS = 2 + Math.floor(Math.random() * 3);
    const splitAxis = (total: number, count: number): number[] => {
      const weights: number[] = [];
      for (let i = 0; i < count; i++) weights.push(0.5 + Math.random());
      const sum = weights.reduce((a, b) => a + b, 0);
      const bounds = [0];
      let acc = 0;
      for (let i = 0; i < count - 1; i++) {
        acc += (weights[i] / sum) * total;
        bounds.push(Math.max(bounds[i] + 2, Math.round(acc)));
      }
      bounds.push(total);
      return bounds;
    };
    const xb = splitAxis(src.width, COLS);
    const yb = splitAxis(src.height, ROWS);
    // Some deaths burst violently, others just crumble apart
    const fallsApart = Math.random() < 0.4;
    const explosive = fallsApart
      ? 0.25 + Math.random() * 0.35 // crumble: weak push
      : 0.8 + Math.random() * 0.7; // burst: hard
    const dispScaleX = sprite.displayWidth / src.width;
    const dispScaleY = sprite.displayHeight / src.height;
    const rot = sprite.rotation; // tipped-over corpses burst from their pose
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const alpha = Math.max(sprite.alpha, 0.5); // phantoms still show their burst

    // The flight every piece takes: burst or crumble, then land through
    // the shared debris pipeline
    const fling = (piece: Phaser.GameObjects.Image, persist = false): void => {
      const longShot = Math.random() < 0.01; // ~1 in 100
      const rx = piece.x - sprite.x;
      const ry = piece.y - sprite.y;
      const ang = Math.atan2(ry, rx) + (Math.random() - 0.5) * 0.7;
      const dirX = Math.cos(ang);
      const dirY = Math.sin(ang);
      const dist = longShot
        ? 90 + Math.random() * 80          // 90-170px: the occasional far fling
        : (10 + Math.random() * Math.random() * 70) * explosive;
      const duration = longShot
        ? 900 + Math.random() * 600        // readable flight for the far ones
        : (400 + Math.random() * 800) / (0.7 + explosive * 0.55);
      const bounces = longShot ? 2 + Math.floor(Math.random() * 2) : 1;
      this.scene.tweens.add({
        targets: piece,
        x: piece.x + dirX * dist,
        y: piece.y + dirY * dist + 8 + Math.random() * 14 + (fallsApart ? 12 : 0),
        angle: piece.angle + (Math.random() - 0.5) * 720 * explosive,
        duration,
        ease: fallsApart ? 'Power1.in' : 'Power2.out',
        onComplete: () => {
          if (!piece.active) return;
          // Lands through the shared pipeline: glide/drip down walls,
          // trees and towers like blood; on ground, bounce and roll
          // along the direction it was flying in
          this.landDebris(piece, piece.x, piece.y, dirX, dirY, bounces, persist);
        },
      });
    };

    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const px0 = xb[gx];
        const py0 = yb[gy];
        const w = xb[gx + 1] - px0;
        const h = yb[gy + 1] - py0;
        if (w < 2 || h < 2) continue;
        const sx = src.cutX + px0;
        const sy = src.cutY + py0;
        const shardName = `shard_${sx}_${sy}_${w}_${h}`;
        if (!tex.has(shardName)) {
          tex.add(shardName, src.sourceIndex, sx, sy, w, h);
        }

        const ox = (px0 + w / 2) * dispScaleX - sprite.displayWidth / 2;
        const oy = (py0 + h / 2) * dispScaleY - sprite.displayHeight / 2;
        const piece = this.scene.add.image(
          sprite.x + ox * cosR - oy * sinR,
          sprite.y + ox * sinR + oy * cosR,
          sprite.texture.key,
          shardName,
        );
        piece.rotation = rot;
        piece.setDepth(16); // above blood (11) and projectiles (15)
        piece.setAlpha(alpha);

        fling(piece);
      }
    }

    // One random bone fragment joins the burst — every death except the
    // bleed-out funnels through here — riding the exact same
    // fall/explode animation as the shards (summoned ninjas leave none)
    const BONE_KEYS = ['bone_1', 'bone_2', 'bone_3', 'bone_4'];
    const SKULL_KEY = 'bone_5';
    const NO_SKEL = new Set(['ninja', 'phantom', 'bat']);
    const isHeavy = enemy.weight >= 350;
    const skelKey = NO_SKEL.has(enemy.type)
      ? null
      : isHeavy && this.scene.textures.exists(SKULL_KEY)
        ? SKULL_KEY
        : BONE_KEYS[Math.floor(Math.random() * BONE_KEYS.length)];
    if (skelKey && this.scene.textures.exists(skelKey)) {
      // Scale skeleton by weight — heavy enemies (brute) get the full
      // 0.9×, lightweight enemies get 0.65× minimum
      const maxWeight = 2000; // brute = heaviest
      const scale = 0.65 + 0.25 * Math.min(1, enemy.weight / maxWeight);
      const skel = this.scene.add.image(
        sprite.x + (Math.random() - 0.5) * sprite.displayWidth * 0.5,
        sprite.y + (Math.random() - 0.5) * sprite.displayHeight * 0.5,
        skelKey,
      );
      skel.setDisplaySize(sprite.displayWidth * scale, sprite.displayHeight * scale);
      skel.setDepth(10); // below the blood (11) so splatter covers it
      skel.setAlpha(alpha);
      fling(skel, true); // bones rest on the ground for 30s first
    }
  }

  createDeathEffect(x: number, y: number, color: string): void {
    const particles = this.scene.add.circle(x, y, 4, Phaser.Display.Color.HexStringToColor(color).color);
    this.scene.tweens.add({
      targets: particles, alpha: 0, scaleX: 2, scaleY: 2, duration: 300,
      onComplete: () => particles.destroy(),
    });
  }

}
