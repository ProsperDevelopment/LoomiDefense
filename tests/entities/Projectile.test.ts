import { describe, it, expect } from 'vitest';
import { Projectile } from '../../src/entities/Projectile';
import { Position } from '../../src/components/Position';
import { Damage } from '../../src/components/Damage';

describe('Projectile', () => {
  it('initializes correctly', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('arrow', 100, 100, dmg as any, 'target1', 0x4CAF50);
    expect(proj.alive).toBe(true);
    expect(proj.position.x).toBe(100);
    expect(proj.position.y).toBe(100);
    expect(proj.getTargetId()).toBe('target1');
    expect(proj.getTowerType()).toBe('arrow');
  });

  it('moves toward target position', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('arrow', 0, 0, dmg as any, 't1', 0x4CAF50, 1000);
    const target = new Position(100, 0);
    proj.update(100, target); // 100ms at 1000px/s = 100px
    expect(proj.position.x).toBeCloseTo(100, 0);
  });

  it('returns true when it reaches target', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('arrow', 0, 0, dmg as any, 't1', 0x4CAF50, 1000);
    const target = new Position(50, 0);
    const reached = proj.update(100, target); // 100ms at 1000px/s = 100px, target at 50
    expect(reached).toBe(true);
  });

  it('dies when target is null', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('arrow', 0, 0, dmg as any, 't1', 0x4CAF50);
    const reached = proj.update(16, null);
    expect(reached).toBe(true);
    expect(proj.alive).toBe(false);
  });

  it('detects hit within radius', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('arrow', 100, 100, dmg as any, 't1', 0x4CAF50);
    const target = new Position(105, 100);
    expect(proj.hasHit(target, 10)).toBe(true);

    const farTarget = new Position(200, 200);
    expect(proj.hasHit(farTarget, 10)).toBe(false);
  });

  it('accepts custom ID', () => {
    const dmg = new Damage(10);
    const proj = new Projectile('cannon', 0, 0, dmg as any, 't1', 0xFF5722, 300, );
    expect(proj.id).toContain('proj_');
  });
});
