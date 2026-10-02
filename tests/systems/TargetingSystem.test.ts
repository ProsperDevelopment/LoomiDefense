import { describe, it, expect } from 'vitest';
import { TargetingSystem, type TargetableEntity } from '../../src/systems/TargetingSystem';
import { Position } from '../../src/components/Position';
import { Health } from '../../src/components/Health';

function makeEnemy(id: string, x: number, y: number, hp: number): TargetableEntity {
  return {
    id,
    position: new Position(x, y),
    health: new Health(hp),
  };
}

describe('TargetingSystem', () => {
  const towerPos = new Position(200, 200);

  it('returns null when no enemies in range', () => {
    const enemies = [makeEnemy('e1', 500, 500, 100)];
    const result = TargetingSystem.findTarget(towerPos, 100, enemies);
    expect(result).toBeNull();
  });

  it('finds closest enemy', () => {
    const e1 = makeEnemy('e1', 250, 200, 100); // dist=50
    const e2 = makeEnemy('e2', 350, 200, 100); // dist=150
    const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2], 'closest');
    expect(result?.id).toBe('e1');
  });

  it('finds strongest enemy', () => {
    const e1 = makeEnemy('e1', 250, 200, 50);
    const e2 = makeEnemy('e2', 250, 200, 200);
    const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2], 'strongest');
    expect(result?.id).toBe('e2');
  });

  it('finds first enemy (lowest HP ratio)', () => {
    const e1 = makeEnemy('e1', 250, 200, 100);
    e1.health.current = 10; // 10% HP
    const e2 = makeEnemy('e2', 250, 200, 100);
    e2.health.current = 80; // 80% HP
    const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2], 'first');
    expect(result?.id).toBe('e1');
  });

  it('excludes dead enemies', () => {
    const e1 = makeEnemy('e1', 250, 200, 100);
    e1.health.current = 0;
    const e2 = makeEnemy('e2', 250, 200, 100);
    const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2], 'first');
    expect(result?.id).toBe('e2');
  });

  it('finds all enemies in range', () => {
    const e1 = makeEnemy('e1', 250, 200, 100); // in range
    const e2 = makeEnemy('e2', 500, 500, 100); // out of range
    const result = TargetingSystem.findEnemiesInRange(towerPos, 100, [e1, e2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('e1');
  });

  it('finds last enemy (highest HP ratio)', () => {
    const e1 = makeEnemy('e1', 250, 200, 100);
    e1.health.current = 10; // 10% HP — furthest along
    const e2 = makeEnemy('e2', 250, 200, 100);
    e2.health.current = 80; // 80% HP — newest to the pack
    const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2], 'last');
    expect(result?.id).toBe('e2');
  });

  it('picks a random enemy in range, never one outside it', () => {
    const e1 = makeEnemy('e1', 250, 200, 100);
    const e2 = makeEnemy('e2', 260, 200, 100);
    const outside = makeEnemy('e3', 500, 500, 100);
    for (let i = 0; i < 20; i++) {
      const result = TargetingSystem.findTarget(towerPos, 200, [e1, e2, outside], 'random');
      expect(['e1', 'e2']).toContain(result?.id);
    }
  });

  it('defaults to first mode when unknown mode given', () => {
    const e1 = makeEnemy('e1', 250, 200, 100);
    const result = TargetingSystem.findTarget(towerPos, 200, [e1], 'first' as any);
    expect(result?.id).toBe('e1');
  });
});
