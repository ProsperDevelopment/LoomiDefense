import { describe, it, expect, beforeEach } from 'vitest';
import { HealthSystem } from '../../src/systems/HealthSystem';
import { Position } from '../../src/components/Position';
import { Health } from '../../src/components/Health';
import { eventBus } from '../../src/utils/EventBus';

function makeEntity(id: string, hp: number, armor: number = 0): { id: string; position: Position; health: Health } {
  return { id, position: new Position(100, 100), health: new Health(hp, armor) };
}

describe('HealthSystem', () => {
  let hs: HealthSystem;

  beforeEach(() => {
    hs = new HealthSystem();
    eventBus.clear();
  });

  it('applies damage directly', () => {
    const e = makeEntity('e1', 100);
    hs.applyDamage(e, 30);
    expect(e.health.current).toBe(70);
  });

  it('returns true when entity dies from damage', () => {
    const e = makeEntity('e1', 100);
    const died = hs.applyDamage(e, 100);
    expect(died).toBe(true);
    expect(e.health.isDead()).toBe(true);
  });

  it('returns false when entity survives', () => {
    const e = makeEntity('e1', 100);
    const died = hs.applyDamage(e, 50);
    expect(died).toBe(false);
  });

  it('queues and processes damage', () => {
    const e = makeEntity('e1', 100);
    hs.queueDamage(e, 40);
    hs.queueDamage(e, 60);
    const killed = hs.processDamage();
    expect(e.health.current).toBe(0);
    expect(killed).toHaveLength(1);
  });

  it('skips damage to already dead entities', () => {
    const e = makeEntity('e1', 100);
    e.health.current = 0;
    hs.queueDamage(e, 50);
    const killed = hs.processDamage();
    expect(killed).toHaveLength(0);
  });

  it('applies armor reduction', () => {
    const e = makeEntity('e1', 100, 10);
    hs.applyDamage(e, 30);
    expect(e.health.current).toBe(80); // 30 - 10 armor = 20 effective
  });

  it('applies splash damage', () => {
    const e1 = makeEntity('e1', 100);
    e1.position.set(110, 100);
    const e2 = makeEntity('e2', 100);
    e2.position.set(300, 300);
    const killed = hs.applySplashDamage(100, 100, 50, 40, [e1, e2]);
    expect(e1.health.current).toBeLessThan(100);
    expect(e2.health.current).toBe(100); // out of range
    expect(killed).toHaveLength(0);
  });

  it('sorts entities by distance', () => {
    const e1 = makeEntity('e1', 100);
    e1.position.set(100, 100);
    const e2 = makeEntity('e2', 100);
    e2.position.set(200, 200);
    const sorted = hs.sortByDistance(100, 100, [e2, e1]);
    expect(sorted[0].id).toBe('e1');
  });

  it('resets correctly', () => {
    hs.queueDamage(makeEntity('e1', 100), 50);
    hs.reset();
    const killed = hs.processDamage();
    expect(killed).toHaveLength(0);
  });
});
