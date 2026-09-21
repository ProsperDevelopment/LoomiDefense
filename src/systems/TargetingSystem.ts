import type { TargetMode } from '../types';
import type { Position } from '../components/Position';
import type { Health } from '../components/Health';

export interface TargetableEntity {
  position: Position;
  health: Health;
  id: string;
}

/**
 * Tower target selection system.
 * Finds the best target for a tower based on its targeting mode.
 */
export class TargetingSystem {
  /**
   * Find the best target from a list of enemies.
   */
  static findTarget(
    towerPos: Position,
    range: number,
    enemies: TargetableEntity[],
    mode: TargetMode = 'first',
  ): TargetableEntity | null {
    // Filter enemies in range
    const inRange = enemies.filter(e => {
      if (e.health.isDead()) return false;
      const dist = towerPos.distanceTo(e.position);
      return dist <= range;
    });

    if (inRange.length === 0) return null;

    switch (mode) {
      case 'first':
        return this.findFirst(inRange);
      case 'closest':
        return this.findClosest(towerPos, inRange);
      case 'strongest':
        return this.findStrongest(inRange);
      default:
        return this.findFirst(inRange);
    }
  }

  /**
   * "First" - target the enemy closest to the base (assumed to be furthest along path).
   * Simplified: use the one with the lowest HP ratio (proxy for being further along).
   */
  private static findFirst(enemies: TargetableEntity[]): TargetableEntity {
    // In a real game you'd track path progress; here we use HP ratio as proxy
    return enemies.reduce((best, e) =>
      e.health.getHealthPercent() < best.health.getHealthPercent() ? e : best
    );
  }

  /**
   * "Closest" - target the enemy nearest to the tower.
   */
  private static findClosest(towerPos: Position, enemies: TargetableEntity[]): TargetableEntity {
    return enemies.reduce((best, e) => {
      const dist = towerPos.distanceTo(e.position);
      const bestDist = towerPos.distanceTo(best.position);
      return dist < bestDist ? e : best;
    });
  }

  /**
   * "Strongest" - target the enemy with the most current HP.
   */
  private static findStrongest(enemies: TargetableEntity[]): TargetableEntity {
    return enemies.reduce((best, e) =>
      e.health.current > best.health.current ? e : best
    );
  }

  /**
   * Find all enemies in range (for splash/AoE towers).
   */
  static findEnemiesInRange(
    center: Position,
    range: number,
    enemies: TargetableEntity[],
  ): TargetableEntity[] {
    return enemies.filter(e =>
      !e.health.isDead() && center.distanceTo(e.position) <= range
    );
  }
}
