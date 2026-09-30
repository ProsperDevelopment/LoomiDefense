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
    // gridCol/gridRow are background-grid coordinates (24px cells)
    expect(pos.x).toBe(2 * 24 + 12);
    expect(pos.y).toBe(4 * 24 + 12 + 48); // +48 for GRID_OFFSET_Y
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
    tower.update(600); // Arrow fireRate=1.8, cooldown=~556ms
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
    for (let i = 0; i < 4; i++) tower.upgrade(); // level 2..5
    expect(tower.level).toBe(5);
    const result = tower.upgrade(); // should fail at max
    expect(result).toBe(false);
    expect(tower.level).toBe(5); // unchanged after failed upgrade
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
    expect(arrow.damage).toBe(5);
    expect(arrow.range).toBe(120);

    const cannon = new Tower('cannon', 0, 0);
    expect(cannon.damage).toBe(25);
    expect(cannon.splashRadius).toBe(60);

    const frost = new Tower('frost', 0, 0);
    expect(frost.slowFactor).toBe(0.4);
    expect(frost.slowDuration).toBe(2000);
  });

  describe('ownership and player color', () => {
    it('has no owner until one is assigned', () => {
      const tower = new Tower('arrow', 1, 1);
      expect(tower.ownerId).toBeNull();
      tower.ownerId = 'player-42';
      expect(tower.ownerId).toBe('player-42');
    });

    it('stores the player color even before the sprite exists', () => {
      const tower = new Tower('arrow', 1, 1);
      tower.setPlayerColor('#ff8800');
      expect(tower.tintColorHex).toBe('#ff8800');
      expect(tower.tintColor).not.toBeNull();

      tower.setPlayerColor('not-a-color'); // ignored
      expect(tower.tintColorHex).toBe('#ff8800');
    });

    it('colors only the accents (pad + crest), never tints the tower art', () => {
      const setTint = vi.fn();
      const circles: Array<{ setStrokeStyle: ReturnType<typeof vi.fn>; setDepth: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
      const scene = {
        add: {
          image: vi.fn(() => ({
            setDisplaySize: vi.fn(),
            setDepth: vi.fn(),
            setTint,
            destroy: vi.fn(),
          })),
          circle: vi.fn(() => {
            const c = {
              setStrokeStyle: vi.fn(),
              setDepth: vi.fn(),
              setVisible: vi.fn(),
              destroy: vi.fn(),
            };
            circles.push(c);
            return c;
          }),
        },
      } as any;

      const tower = new Tower('arrow', 1, 1);
      tower.setPlayerColor('#3366ff'); // stored before sprite
      tower.createSprite(scene);

      // Whole-tower tint must NOT be applied...
      expect(setTint).not.toHaveBeenCalled();
      // ...instead: owner pad + crest gem (+ the range indicator circle)
      expect(circles.length).toBe(3);
      expect(scene.add.image).toHaveBeenCalledTimes(1);
    });
  });
});
