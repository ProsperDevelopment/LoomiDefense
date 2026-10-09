import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import type { Tower } from '../entities/Tower';
import { Projectile } from '../entities/Projectile';
import type { Grid } from '../utils/Grid';
import type { HealthSystem } from './HealthSystem';
import type { WaveManager } from './WaveManager';
import type { NinjaThrow } from '../data/towers';
import { TOWER_DEFINITIONS, ninjaThrowProfile } from '../data/towers';
import { canNinjaThrowHit } from '../utils/damageRules';
import { playSfx } from '../audio/GameAudio';
import { DeathEffects } from './DeathEffects';

// ── Constants ────────────────────────────────────────────────

/** Max ninjas alive at once across all ninja towers. */
export const NINJA_SUMMON_CAP = 5;
/** Pause between one ninja's melee trades (ms) so fights tick, not instakill. */
export const NINJA_HIT_COOLDOWN_MS = 600;
/** How far a ninja keeps chasing its duel target before giving up (px). */
export const NINJA_LEASH = 150;
/** L3+ ninjas stop at this range and throw (px). */
export const NINJA_THROW_RANGE = 80;
/** Pause between a ranged ninja's throws (ms). */
export const NINJA_THROW_COOLDOWN_MS = 900;
/** Throws a ranged ninja carries before it runs dry and fights in melee. */
export const NINJA_THROW_AMMO = 10;
/** How hard each melee trade hits the NINJA back (health drains fast). */
export const NINJA_MELEE_HURT = 2;
/** Body-contact physics: impulse cooldown between two bodies (ms). */
export const CONTACT_CD_MS = 160;
/** Impulse a ninja's melee trade transfers to the bodies involved. */
export const MELEE_IMPULSE = 150;

/** Ninja tint per summoning tower level (L1 keeps its natural green). */
export const NINJA_LEVEL_TINTS: Record<number, number> = {
  2: 0xb0ffb0, // pale green
  3: 0x60d0ff, // ice blue
  4: 0xd090ff, // violet
  5: 0xffd040, // gold
};

// ── Host interface ───────────────────────────────────────────

export interface NinjaCombatHost {
  enemies: Enemy[];
  projectiles: Projectile[];
  grid: Grid;
  healthSystem: HealthSystem;
  waveManager: WaveManager;
  tweens: Phaser.Tweens.TweenManager;
  time: Phaser.Time.Clock;
  add: Phaser.GameObjects.GameObjectFactory;
  startHoleRise(enemy: Enemy): void;
}

// ── System ───────────────────────────────────────────────────

export class NinjaCombat {
  constructor(
    private scene: NinjaCombatHost & Phaser.Scene,
    private deathFx: DeathEffects,
  ) {}

  /**
   * Ninja tower summon gate: only during a wave, never beyond the cap.
   * Called from updateTowerCombat when the tower is a ninja type.
   */
  trySummon(tower: Tower): void {
    if (!tower.canFire() || !this.scene.waveManager.isWaveActive()) return;
    const alive = this.scene.enemies.reduce(
      (n, e) => n + (e.friendly && e.alive && !e.isDead() ? 1 : 0), 0,
    );
    if (alive >= NINJA_SUMMON_CAP) return;
    tower.fire();
    this.spawnNinja(tower);
  }

  /** A ninja tower summons a unit at its chosen base, walking back up. */
  spawnNinja(tower: Tower): void {
    const path = this.scene.grid.resolveBaseRoutePixels(tower.ninjaBase);
    const ninja = new Enemy('ninja', path, undefined, {
      reverse: true,
      friendly: true,
      ownerId: tower.ownerId,
    });
    ninja.summonLevel = tower.level;
    if (ninjaThrowProfile(tower.level)) ninja.throwsLeft = NINJA_THROW_AMMO;
    ninja.position.x += (Math.random() - 0.5) * 12;
    ninja.position.y += (Math.random() - 0.5) * 12;
    ninja.createSprite(this.scene);
    const tint = NINJA_LEVEL_TINTS[tower.level];
    if (tint !== undefined && ninja.sprite) ninja.sprite.setTint(tint);
    this.scene.enemies.push(ninja);
    this.scene.startHoleRise(ninja);
    playSfx(this.scene, 'sfx_magic', { volume: 0.25, rate: 0.9 + Math.random() * 0.2 });
  }

  /**
   * Ninjas stop on the spot when they spot a hittable enemy in shooting
   * range and throw from there (L3+, quiver of 10). When the enemy comes
   * close and collides — or the quiver runs dry — they engage in close
   * combat: lock, press and trade blows until one side dies (or the
   * target outruns the leash). No lock and no contact: back to the path.
   */
  resolveNinjaCollisions(): void {
    for (const ninja of [...this.scene.enemies]) {
      if (!ninja.alive || !ninja.friendly) continue;

      const profile = ninja.summonLevel >= 3 && ninja.throwsLeft > 0
        ? ninjaThrowProfile(ninja.summonLevel)
        : null;
      const canHurt = (e: Enemy): boolean =>
        canNinjaThrowHit(profile, ninja.summonLevel, e.data);

      let target = ninja.combatTargetId
        ? this.scene.enemies.find((e) => e.id === ninja.combatTargetId && e.alive && !e.isDead())
        : undefined;
      if (target && ninja.position.distanceTo(target.position) > NINJA_LEASH) {
        target = undefined;
      }
      if (!target) {
        let bestDist = Infinity;
        for (const e of this.scene.enemies) {
          if (!e.alive || e.isDead() || e.friendly) continue;
          if (!canHurt(e)) continue;
          const d = ninja.position.distanceTo(e.position);
          const limit = profile
            ? NINJA_THROW_RANGE
            : ninja.data.size + e.data.size + 4;
          if (d <= limit && d < bestDist) {
            bestDist = d;
            target = e;
          }
        }
      }
      if (!target) {
        ninja.combatTargetId = null;
        ninja.meleeFocus = null;
        ninja.fighting = false;
        continue;
      }
      ninja.combatTargetId = target.id;

      const dx = ninja.position.x - target.position.x;
      const dy = ninja.position.y - target.position.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = ninja.data.size + target.data.size;

      if (profile && dist > reach) {
        ninja.fighting = false;
        if (ninja.collisionCd <= 0 && dist <= NINJA_THROW_RANGE) {
          this.ninjaThrow(ninja, target, profile);
        }
        const dirX = dx / dist;
        const dirY = dy / dist;
        if (dist <= NINJA_THROW_RANGE) {
          ninja.meleeFocus = { x: ninja.position.x, y: ninja.position.y };
        } else {
          ninja.meleeFocus = {
            x: target.position.x + dirX * (NINJA_THROW_RANGE - 4),
            y: target.position.y + dirY * (NINJA_THROW_RANGE - 4),
          };
        }
        continue;
      }

      ninja.fighting = true;
      ninja.meleeFocus = {
        x: target.position.x + (dx / dist) * (reach - 4),
        y: target.position.y + (dy / dist) * (reach - 4),
      };
      if (ninja.collisionCd > 0) continue;
      let strike: Enemy | undefined;
      let strikeDist = Infinity;
      for (const e of this.scene.enemies) {
        if (!e.alive || e.isDead() || e.friendly) continue;
        if (!canHurt(e)) continue;
        const d = ninja.position.distanceTo(e.position);
        if (d <= ninja.data.size + e.data.size && d < strikeDist) {
          strikeDist = d;
          strike = e;
        }
      }
      if (!strike) continue;
      this.ninjaCollide(ninja, strike);
      if (!target.alive || target.isDead()) ninja.combatTargetId = null;
    }
  }

  /** A level 3+ ninja throws an arrow, cannonball or grenade at its target. */
  ninjaThrow(ninja: Enemy, target: Enemy, profile: NinjaThrow): void {
    ninja.throwsLeft = Math.max(0, ninja.throwsLeft - 1);
    ninja.collisionCd = NINJA_THROW_COOLDOWN_MS;
    const proj = new Projectile(
      profile.towerType,
      ninja.position.x,
      ninja.position.y - 8,
      {
        baseDamage: profile.damage,
        splashRadius: profile.splash,
        slowFactor: 1.0,
        slowDuration: 0,
      } as any,
      target.id,
      Phaser.Display.Color.HexStringToColor(TOWER_DEFINITIONS[profile.towerType].color).color,
      180,
    );
    proj.ownerId = ninja.ownerId;
    proj.towerLevel = ninja.summonLevel;
    proj.markAsNinjaThrow();
    proj.createSprite(this.scene);
    this.scene.projectiles.push(proj);
  }

  /**
   * Body physics: overlapping enemies trade a weight-based impulse.
   * Heavier bodies barely budge while light ones get flung.
   * Phantoms and bats sit this out entirely.
   */
  resolveEnemyPhysics(): void {
    const bodies = this.scene.enemies;
    for (const e of bodies) e.refreshPhysics();
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.alive || !a.collidable || a.contactCd > 0) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b.alive || b.isDead() || !b.collidable || b.contactCd > 0) continue;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const reach = a.data.size + b.data.size;
        const dist = Math.hypot(dx, dy);
        if (dist >= reach) continue;
        const nx = dist < 0.001 ? 1 : dx / dist;
        const ny = dist < 0.001 ? 0 : dy / dist;

        if (a.friendly && !b.friendly) b.awakenPhysics(a);
        else if (b.friendly && !a.friendly) a.awakenPhysics(b);
        const activeA = a.friendly || a.hasPhysics();
        const activeB = b.friendly || b.hasPhysics();
        if (!activeA || !activeB) continue;

        const da = a.currentDirection();
        const db = b.currentDirection();
        const closing =
          (da.x * a.data.speed - db.x * b.data.speed) * nx +
          (da.y * a.data.speed - db.y * b.data.speed) * ny;
        const strength = closing > 5 ? Math.min(320, closing * 0.7 + 40) : 60;

        this.applyCollisionImpulse(a, b, nx, ny, strength);
        a.contactCd = CONTACT_CD_MS;
        b.contactCd = CONTACT_CD_MS;

        const total = a.weight + b.weight;
        const overlap = (reach - dist) * 0.8;
        a.position.x -= nx * overlap * (b.weight / total);
        a.position.y -= ny * overlap * (b.weight / total);
        b.position.x += nx * overlap * (a.weight / total);
        b.position.y += ny * overlap * (a.weight / total);
      }
    }
  }

  /** Kick both bodies apart: lighter ones fly farther, glancing hits spin more. */
  applyCollisionImpulse(a: Enemy, b: Enemy, nx: number, ny: number, strength: number): void {
    const total = a.weight + b.weight;
    const dvA = strength * (b.weight / total);
    const dvB = strength * (a.weight / total);
    a.knockVX -= nx * dvA;
    a.knockVY -= ny * dvA;
    b.knockVX += nx * dvB;
    b.knockVY += ny * dvB;
    const da = a.currentDirection();
    const db = b.currentDirection();
    const wobble = (vx: number, vy: number, dv: number): number =>
      Math.max(-8, Math.min(8, (vx * ny - vy * nx) * dv * 0.06));
    a.spin += wobble(da.x, da.y, dvA);
    b.spin += wobble(db.x, db.y, dvB);
  }

  /**
   * Random hit reaction while a ninja trades blows: fly up spinning,
   * spin around through the sheet's directions, or tip over.
   */
  ninjaHitFx(body: Enemy): void {
    if (!body.alive || !body.sprite || !body.sprite.active) return;
    this.scene.tweens.killTweensOf(body);
    body.fxX = 0;
    body.fxY = 0;
    body.fxRotation = 0;
    body.animOverride = null;

    const roll = Math.random();
    const tilt = Math.min(1, 120 / body.weight);
    if (roll < 1 / 3) {
      const turn =
        (Math.random() < 0.5 ? -1 : 1) *
        (Math.PI / 2 + Math.random() * Math.PI * 1.5) * tilt;
      this.scene.tweens.add({
        targets: body, fxY: -24, duration: 230,
        ease: 'Power2.out', yoyo: true, repeat: 1,
      });
      this.scene.tweens.add({
        targets: body, fxRotation: turn, duration: 460, ease: 'Linear',
        onComplete: () => { body.fxRotation = 0; },
      });
    } else if (roll < 2 / 3) {
      this.scene.tweens.add({
        targets: body, fxRotation: Math.PI * 2, duration: 360, ease: 'Linear',
        onComplete: () => { body.fxRotation = 0; },
      });
      const base = body.sprite!.texture.key.replace('enemy_', '');
      const keys = [`${base}_left`, `${base}_walk`, `${base}_right`];
      body.animOverride = keys[0];
      keys.forEach((k, i) => {
        if (i === 0) return;
        this.scene.time.delayedCall(130 * i, () => { body.animOverride = k; });
      });
      this.scene.time.delayedCall(130 * keys.length, () => { body.animOverride = null; });
    } else {
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.scene.tweens.add({
        targets: body, fxRotation: dir * 1.4 * tilt, duration: 160,
        ease: 'Power2.out', yoyo: true, repeat: 1,
        onComplete: () => { body.fxRotation = 0; },
      });
    }
  }

  /** One melee trade: the ninja bounces off; the enemy reacts by weight. */
  ninjaCollide(ninja: Enemy, target: Enemy): void {
    const dmg = ninja.data.contactDamage ?? 8;
    ninja.collisionCd = NINJA_HIT_COOLDOWN_MS;

    const dx = target.position.x - ninja.position.x;
    const dy = target.position.y - ninja.position.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    if (target.collidable) {
      target.awakenPhysics(ninja);
      this.applyCollisionImpulse(target, ninja, -nx, -ny, MELEE_IMPULSE);
      ninja.contactCd = CONTACT_CD_MS;
      target.contactCd = CONTACT_CD_MS;
      ninja.spin += (Math.random() < 0.5 ? -1 : 1) * 3;
      target.spin += (Math.random() < 0.5 ? -1 : 1) * 2;
    }
    ninja.applyImpact();

    this.deathFx.createBloodSplatter(nx, ny, target.position, target.data.size, 0);
    this.deathFx.createBloodSplatter(-nx, -ny, ninja.position, ninja.data.size, 0);
    playSfx(this.scene, 'sfx_swoosh3', { volume: 0.22, rate: 0.9 + Math.random() * 0.2 });
    playSfx(this.scene, 'sfx_squish', { volume: 0.4, rate: 0.9 + Math.random() * 0.25 });

    const targetKilled = this.scene.healthSystem.applyDamage(
      { id: target.id, position: target.position, health: target.health }, dmg,
    );
    const ninjaKilled = this.scene.healthSystem.applyDamage(
      { id: ninja.id, position: ninja.position, health: ninja.health }, dmg * NINJA_MELEE_HURT,
    );

    if (!targetKilled && target.alive && target.collidable) this.ninjaHitFx(target);
    if (!ninjaKilled && ninja.alive) this.ninjaHitFx(ninja);

    if (targetKilled) this.deathFx.onEnemyKilled(target, ninja.ownerId, { x: nx, y: ny });
    if (ninjaKilled) this.deathFx.onNinjaKilled(ninja, { x: -nx, y: -ny });
  }
}
