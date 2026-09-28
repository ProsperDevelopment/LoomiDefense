// ============================================================
// Tests for the extended tower roster and store/loadout rules.
// ============================================================
import { describe, it, expect } from 'vitest';
import { TOWER_DEFINITIONS, TOWER_LIST, TOWER_UPGRADES } from '../../src/data/towers';
import { TOWER_SPRITE_FRAMES } from '../../src/entities/Tower';
import type { TowerType } from '../../src/types';

const ALL_TYPES: TowerType[] = ['arrow', 'cannon', 'frost', 'sniper', 'mortar', 'tesla'];
const FREE_TOWERS = ['arrow', 'cannon', 'frost'];
const STORED_TOWERS = ['sniper', 'mortar', 'tesla'];

describe('tower roster', () => {
  it('defines all six tower types', () => {
    for (const type of ALL_TYPES) {
      expect(TOWER_DEFINITIONS[type], `missing definition for ${type}`).toBeDefined();
      expect(TOWER_DEFINITIONS[type].type).toBe(type);
    }
    expect(TOWER_LIST).toHaveLength(6);
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
  });

  it('every tower has a sprite frame within the tileset (0-35)', () => {
    for (const type of ALL_TYPES) {
      const frame = TOWER_SPRITE_FRAMES[type];
      expect(frame, `no frame for ${type}`).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThanOrEqual(33); // normal frame of last group
      expect(frame % 3).toBe(0); // groups of 3 (normal, damaged1, damaged2)
    }
  });

  it('defines upgrade multipliers for all towers', () => {
    expect(TOWER_UPGRADES).toHaveLength(3);
    expect(TOWER_UPGRADES[2].damageMultiplier).toBeGreaterThan(1);
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
  it('validates loadout: exactly 3 unique owned towers', () => {
    const owned = ['arrow', 'cannon', 'frost', 'sniper'];
    const validate = (loadout: string[]) =>
      loadout.length === 3 && new Set(loadout).size === 3 && loadout.every((t) => owned.includes(t));

    expect(validate(['arrow', 'cannon', 'frost'])).toBe(true);
    expect(validate(['arrow', 'cannon', 'sniper'])).toBe(true);
    expect(validate(['arrow', 'cannon'])).toBe(false); // too few
    expect(validate(['arrow', 'cannon', 'frost', 'sniper'])).toBe(false); // too many
    expect(validate(['arrow', 'arrow', 'frost'])).toBe(false); // duplicates
    expect(validate(['arrow', 'cannon', 'mortar'])).toBe(false); // not owned
  });
});
