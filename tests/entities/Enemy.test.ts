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
