import type { TargetMode } from '../types';
import type { Position } from '../components/Position';
import type { Health } from '../components/Health';

export interface TargetableEntity {
  position: Position;
  health: Health;
  id: string;
  /** Distance left to the base — drives "first" targeting. */
  pathRemaining?: number;
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
      case 'last':
        return this.findLast(inRange);
      case 'random':
        return inRange[Math.floor(Math.random() * inRange.length)];
      default:
        return this.findFirst(inRange);
    }
  }

  /**
   * "First" - the enemy closest to the base (furthest along the path).
   * Falls back to the HP-ratio proxy when no path data is provided.
   */
  private static findFirst(enemies: TargetableEntity[]): TargetableEntity {
    if (enemies.some((e) => e.pathRemaining === undefined)) {
      return enemies.reduce((best, e) =>
        e.health.getHealthPercent() < best.health.getHealthPercent() ? e : best
      );
    }
    return enemies.reduce((best, e) =>
      (e.pathRemaining as number) < (best.pathRemaining as number) ? e : best
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
   * "Last" - target the enemy newest to the pack (highest HP ratio,
   * the mirror of the HP-ratio proxy used for "first").
   */
  private static findLast(enemies: TargetableEntity[]): TargetableEntity {
    return enemies.reduce((best, e) =>
      e.health.getHealthPercent() > best.health.getHealthPercent() ? e : best
    );
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
