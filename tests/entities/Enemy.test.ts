import { describe, it, expect, beforeEach } from 'vitest';
import { Enemy } from '../../src/entities/Enemy';
import { Position } from '../../src/components/Position';

const simplePath = [
  { x: 48, y: 48 },
  { x: 96, y: 48 },
  { x: 144, y: 48 },
  { x: 192, y: 48 },
];

describe('Enemy', () => {
  let enemy: Enemy;

  beforeEach(() => {
    enemy = new Enemy('basic', simplePath);
  });

  it('initializes with correct type data', () => {
    expect(enemy.type).toBe('basic');
    expect(enemy.data.hp).toBe(80);
    expect(enemy.data.speed).toBe(60);
    expect(enemy.alive).toBe(true);
    expect(enemy.reachedBase).toBe(false);
  });

  it('starts at the first path point', () => {
    expect(enemy.position.x).toBe(48);
    expect(enemy.position.y).toBe(48);
  });

  it('follows the path', () => {
    // Move for a long time to progress along the path
    for (let i = 0; i < 50; i++) {
      enemy.update(100);
    }
    // Should have moved from start
    expect(enemy.position.x).toBeGreaterThan(48);
  });

  it('reports reached base when path ends', () => {
    // Fast-forward through the entire path
    for (let i = 0; i < 500; i++) {
      const reached = enemy.update(100);
      if (reached) break;
    }
    expect(enemy.reachedBase).toBe(true);
  });

  it('can be killed', () => {
    enemy.kill();
    expect(enemy.isDead()).toBe(true);
    expect(enemy.alive).toBe(false);
  });

  it('different types have different stats', () => {
    const fast = new Enemy('fast', simplePath);
    expect(fast.data.speed).toBe(120);
    expect(fast.data.hp).toBe(50);

    const armored = new Enemy('armored', simplePath);
    expect(armored.data.armor).toBe(5);
    expect(armored.data.hp).toBe(250);
  });

  it('accepts custom ID', () => {
    const e = new Enemy('basic', simplePath, 'my_id');
    expect(e.id).toBe('my_id');
  });
});

describe('new enemy types', () => {
  it('defines brute, sprinter and phantom', () => {
    const brute = new Enemy('brute', simplePath);
    expect(brute.data.hp).toBeGreaterThan(400);
    expect(brute.data.armor).toBeGreaterThan(0);
    expect(brute.data.invisible).toBeUndefined();

    const sprinter = new Enemy('sprinter', simplePath);
    expect(sprinter.data.speed).toBeGreaterThan(150);
    expect(sprinter.data.hp).toBeLessThan(60);

    const phantom = new Enemy('phantom', simplePath);
    expect(phantom.data.invisible).toBe(true);
    expect(phantom.data.speed).toBeGreaterThan(60);
  });

  it('phantom is damageable only by upgraded sniper/archer', async () => {
    const { canDamageEnemy } = await import('../../src/utils/damageRules');
    const phantom = new Enemy('phantom', simplePath);
    expect(canDamageEnemy('arrow', 1, phantom.data)).toBe(false);
    expect(canDamageEnemy('arrow', 2, phantom.data)).toBe(true);
    expect(canDamageEnemy('sniper', 3, phantom.data)).toBe(true);
    expect(canDamageEnemy('cannon', 5, phantom.data)).toBe(false);
  });
});

describe('splitter enemy', () => {
  // Long straight path so the21s test never reaches the base
  const longPath = Array.from({ length: 60 }, (_, i) => ({ x: i * 48, y: 0 }));

  it('is quite resistant', () => {
    const splitter = new Enemy('splitter', longPath);
    expect(splitter.data.hp).toBeGreaterThanOrEqual(500);
    expect(splitter.data.armor).toBeGreaterThanOrEqual(6);
    expect(splitter.data.speed).toBeLessThanOrEqual(35);
  });

  it('minis are weaker, quicker half-size copies that never split', () => {
    const parent = new Enemy('splitter', longPath);
    const mini = new Enemy('splitter', longPath, undefined, { mini: true });
    expect(mini.isMini).toBe(true);
    expect(mini.data.hp).toBeLessThan(parent.data.hp);
    expect(mini.data.size).toBeLessThan(parent.data.size);
    expect(mini.data.speed).toBeGreaterThan(parent.data.speed);
    // Parent keeps its own stats (definitions are never mutated)
    expect(parent.data.hp).toBe(650);
    expect(new Enemy('splitter', longPath).data.hp).toBe(650);
  });

  it('stops dead for two seconds every twenty, then signals a split', () => {
    const e = new Enemy('splitter', longPath);
    let t = 0;
    while (t < 19500) {
      e.update(500);
      t += 500;
    }
    expect(e.consumeSplitRequest()).toBe(false);

    // Crossing the 20s mark freezes it in place
    e.update(600);
    const frozenX = e.position.x;
    e.update(500);
    e.update(500);
    expect(e.position.x).toBe(frozenX);
    expect(e.consumeSplitRequest()).toBe(false);

    // The2s stop completes -> one-shot split signal, walking resumes
    e.update(1200);
    expect(e.consumeSplitRequest()).toBe(true);
    expect(e.consumeSplitRequest()).toBe(false);
    const beforeResume = e.position.x;
    e.update(500);
    expect(e.position.x).toBeGreaterThan(beforeResume);
  });
});
