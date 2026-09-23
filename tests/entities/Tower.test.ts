import { describe, it, expect, vi } from 'vitest';
import { Tower } from '../../src/entities/Tower';
import { TOWER_DEFINITIONS } from '../../src/data/towers';

describe('Tower', () => {
  it('creates with correct type data', () => {
    const tower = new Tower('arrow', 5, 3);
    expect(tower.type).toBe('arrow');
    expect(tower.getGridCol()).toBe(5);
    expect(tower.getGridRow()).toBe(3);
    expect(tower.data.cost).toBe(50);
    expect(tower.level).toBe(1);
  });

  it('calculates correct world position', () => {
    const tower = new Tower('cannon', 2, 4);
    const pos = tower.getWorldPosition();
    expect(pos.x).toBe(2 * 48 + 24);
    expect(pos.y).toBe(4 * 48 + 24 + 48); // +48 for GRID_OFFSET_Y
  });

  it('can fire after timer expires', () => {
    const tower = new Tower('arrow', 0, 0);
    expect(tower.canFire()).toBe(true);
    tower.fire();
    expect(tower.canFire()).toBe(false);
  });

  it('fires again after cooldown', () => {
    const tower = new Tower('arrow', 0, 0);
    tower.fire();
    tower.update(500); // Arrow fireRate=2.5, cooldown=400ms
    expect(tower.canFire()).toBe(true);
  });

  it('upgrades correctly', () => {
    const tower = new Tower('arrow', 0, 0);
    const baseDamage = tower.damage;
    const result = tower.upgrade();
    expect(result).toBe(true);
    expect(tower.level).toBe(2);
    expect(tower.damage).toBeGreaterThan(baseDamage);
  });

  it('cannot upgrade beyond max level', () => {
    const tower = new Tower('arrow', 0, 0);
    tower.upgrade(); // level 2
    tower.upgrade(); // level 3
    const result = tower.upgrade(); // should fail
    expect(result).toBe(false);
    expect(tower.level).toBe(3);
  });

  it('generates unique IDs for different positions', () => {
    const t1 = new Tower('arrow', 0, 0);
    const t2 = new Tower('arrow', 1, 1);
    expect(t1.id).not.toBe(t2.id);
  });

  it('accepts custom ID', () => {
    const tower = new Tower('arrow', 0, 0, 'custom_id');
    expect(tower.id).toBe('custom_id');
  });

  it('initializes with correct stats for each type', () => {
    const arrow = new Tower('arrow', 0, 0);
    expect(arrow.damage).toBe(10);
    expect(arrow.range).toBe(150);

    const cannon = new Tower('cannon', 0, 0);
    expect(cannon.damage).toBe(40);
    expect(cannon.splashRadius).toBe(60);

    const frost = new Tower('frost', 0, 0);
    expect(frost.slowFactor).toBe(0.4);
    expect(frost.slowDuration).toBe(2000);
  });
});
