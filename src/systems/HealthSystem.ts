import type { Health } from '../components/Health';
import type { Position } from '../components/Position';


export interface DamageableEntity {
  id: string;
  position: Position;
  health: Health;
}

/**
 * Handles damage, death, and status effects on entities.
 */
export class HealthSystem {
  private damageQueue: { entity: DamageableEntity; amount: number }[] = [];

  /**
   * Queue damage to be applied next frame (avoids mutation during iteration).
   */
  queueDamage(entity: DamageableEntity, amount: number): void {
    this.damageQueue.push({ entity, amount });
  }

  /**
   * Process all queued damage and return list of killed entities.
   */
  processDamage(): DamageableEntity[] {
    const killed: DamageableEntity[] = [];

    for (const { entity, amount } of this.damageQueue) {
      if (entity.health.isDead()) continue;

      entity.health.takeDamage(amount);

      if (entity.health.isDead()) {
        killed.push(entity);
      }
    }

    this.damageQueue = [];
    return killed;
  }

  /**
   * Apply damage directly and check for death.
   * The caller is responsible for emitting 'enemy-killed' exactly once
   * (GameScene.onEnemyKilled) — emitting here as well would double-count
   * kills in listeners.
   */
  applyDamage(entity: DamageableEntity, amount: number): boolean {
    if (entity.health.isDead()) return false;

    entity.health.takeDamage(amount);

    return entity.health.isDead();
  }

  /**
   * Apply splash damage to all entities within radius.
   */
  applySplashDamage(
    centerX: number,
    centerY: number,
    radius: number,
    damage: number,
    entities: DamageableEntity[],
  ): DamageableEntity[] {
    const killed: DamageableEntity[] = [];

    for (const entity of entities) {
      if (entity.health.isDead()) continue;

      const dx = entity.position.x - centerX;
      const dy = entity.position.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Damage falls off with distance (100% at center, 50% at edge)
        const falloff = 1 - (dist / radius) * 0.5;
        const effectiveDamage = damage * falloff;

        entity.health.takeDamage(effectiveDamage);

        if (entity.health.isDead()) {
          killed.push(entity);
        }
      }
    }

    return killed;
  }

  /**
   * Update status effects on an entity.
   */
  updateEntity(entity: DamageableEntity, deltaMs: number): number {
    entity.health.updateStatusEffects(deltaMs);
    return entity.health.getHealthPercent();
  }

  /**
   * Get entities sorted by distance from a point (nearest first).
   */
  sortByDistance(
    x: number,
    y: number,
    entities: DamageableEntity[],
  ): DamageableEntity[] {
    return [...entities].sort((a, b) => {
      const dxa = a.position.x - x;
      const dya = a.position.y - y;
      const dxb = b.position.x - x;
      const dyb = b.position.y - y;
      return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
    });
  }

  reset(): void {
    this.damageQueue = [];
  }
}
