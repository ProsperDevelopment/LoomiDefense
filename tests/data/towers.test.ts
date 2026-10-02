// ============================================================
// Tests for the extended tower roster and store/loadout rules.
// ============================================================
import { describe, it, expect } from 'vitest';
import { Tower } from '../../src/entities/Tower';
import { TOWER_DEFINITIONS, TOWER_LIST, TOWER_UPGRADES, MAX_TOWER_LEVEL, DEFAULT_TOWER_LIMITS } from '../../src/data/towers';
import { TOWER_SPRITE_FRAMES } from '../../src/entities/Tower';
import type { TowerType } from '../../src/types';

const ALL_TYPES: TowerType[] = ['arrow', 'cannon', 'frost', 'sniper', 'mortar', 'tesla', 'grenade'];
const FREE_TOWERS = ['arrow', 'cannon', 'frost'];
const STORED_TOWERS = ['sniper', 'mortar', 'tesla', 'grenade'];

describe('tower roster', () => {
  it('defines all seven tower types', () => {
    for (const type of ALL_TYPES) {
      expect(TOWER_DEFINITIONS[type], `missing definition for ${type}`).toBeDefined();
      expect(TOWER_DEFINITIONS[type].type).toBe(type);
    }
    expect(TOWER_LIST).toHaveLength(7);
  });

  it('new towers have sane stats', () => {
    const sniper = TOWER_DEFINITIONS.sniper;
    expect(sniper.range).toBeGreaterThan(TOWER_DEFINITIONS.arrow.range);
    expect(sniper.damage).toBeGreaterThan(TOWER_DEFINITIONS.cannon.damage);
    expect(sniper.splashRadius).toBe(0);

    const mortar = TOWER_DEFINITIONS.mortar;
    expect(mortar.splashRadius).toBeGreaterThanOrEqual(60);
    expect(mortar.fireRate).toBeLessThan(1);

    const tesla = TOWER_DEFINITIONS.tesla;
    expect(tesla.fireRate).toBeGreaterThanOrEqual(3);
    expect(tesla.splashRadius).toBeGreaterThan(0);

    const grenade = TOWER_DEFINITIONS.grenade;
    expect(grenade.shrapnelCount).toBeGreaterThan(0);
    expect(grenade.splashRadius).toBeGreaterThan(0);
  });

  it('every tower has a sprite frame within the tileset (0-35)', () => {
    for (const type of ALL_TYPES) {
      const frame = TOWER_SPRITE_FRAMES[type];
      expect(frame, `no frame for ${type}`).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThanOrEqual(33); // normal frame of last group
      expect(frame % 3).toBe(0); // groups of 3 (normal, damaged1, damaged2)
    }
  });

  it('ships the default build caps', () => {
    expect(DEFAULT_TOWER_LIMITS).toEqual({
      arrow: 10,
      cannon: 10,
      frost: 10,
      sniper: 4,
      mortar: 1,
      tesla: 1,
      grenade: 1,
    });
    // Every tower type must have a cap
    for (const type of ALL_TYPES) {
      expect(DEFAULT_TOWER_LIMITS[type], `no cap for ${type}`).toBeTypeOf('number');
    }
  });

  it('defines 5 upgrade levels with growing multipliers', () => {
    expect(TOWER_UPGRADES).toHaveLength(5);
    expect(TOWER_UPGRADES[4].level).toBe(5);
    expect(TOWER_UPGRADES[4].damageMultiplier).toBeGreaterThan(TOWER_UPGRADES[3].damageMultiplier);
    expect(TOWER_UPGRADES[4].damageMultiplier).toBeGreaterThan(TOWER_UPGRADES[2].damageMultiplier);
    expect(TOWER_UPGRADES[4].fireRateMultiplier).toBeGreaterThan(1);
    expect(MAX_TOWER_LEVEL).toBe(5);
  });

  it('starts weak and grows across all 5 levels', () => {
    const tower = new Tower('arrow', 0, 0);
    const base = { damage: tower.damage, fireRate: tower.fireRate, range: tower.range };
    let upgrades = 0;
    while (tower.upgrade()) upgrades++;
    expect(upgrades).toBe(4); // 1 -> 5
    expect(tower.level).toBe(5);
    expect(tower.damage).toBeGreaterThan(base.damage * 3);
    expect(tower.fireRate).toBeGreaterThan(base.fireRate);
    expect(tower.range).toBeGreaterThan(base.range);
  });

  it('splits free vs store towers', () => {
    for (const t of FREE_TOWERS) {
      expect(TOWER_DEFINITIONS[t]).toBeDefined();
    }
    for (const t of STORED_TOWERS) {
      expect(TOWER_DEFINITIONS[t]).toBeDefined();
    }
    expect(new Set([...FREE_TOWERS, ...STORED_TOWERS])).toEqual(new Set(ALL_TYPES));
  });
});

describe('loadout rules', () => {
  it('validates loadout: 3 or 4 unique owned towers', () => {
    const owned = ['arrow', 'cannon', 'frost', 'sniper'];
    const validate = (loadout: string[]) =>
      loadout.length >= 3 &&
      loadout.length <= 4 &&
      new Set(loadout).size === loadout.length &&
      loadout.every((t) => owned.includes(t));

    expect(validate(['arrow', 'cannon', 'frost'])).toBe(true);
    expect(validate(['arrow', 'cannon', 'sniper'])).toBe(true);
    expect(validate(['arrow', 'cannon', 'frost', 'sniper'])).toBe(true); // four allowed
    expect(validate(['arrow', 'cannon'])).toBe(false); // too few
    expect(validate(['arrow', 'cannon', 'frost', 'sniper', 'mortar'])).toBe(false); // too many
    expect(validate(['arrow', 'arrow', 'frost'])).toBe(false); // duplicates
    expect(validate(['arrow', 'cannon', 'mortar'])).toBe(false); // not owned
  });
});
