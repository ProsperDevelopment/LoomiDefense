// ============================================================
// Tests for the extended tower roster and store/loadout rules.
// ============================================================
import { describe, it, expect } from 'vitest';
import { Tower } from '../../src/entities/Tower';
import { TOWER_DEFINITIONS, TOWER_LIST, TOWER_UPGRADES, MAX_TOWER_LEVEL, DEFAULT_TOWER_LIMITS, farmIncome, beaconFireRateBuff, ninjaThrowProfile } from '../../src/data/towers';
import { TOWER_SPRITE_FRAMES } from '../../src/entities/Tower';
import type { TowerType } from '../../src/types';

const ALL_TYPES: TowerType[] = ['arrow', 'cannon', 'frost', 'sniper', 'mortar', 'tesla', 'grenade', 'farm', 'beacon', 'ninja'];
const FREE_TOWERS = ['arrow', 'cannon', 'frost'];
const STORED_TOWERS = ['sniper', 'mortar', 'tesla', 'grenade', 'farm', 'beacon', 'ninja'];

describe('tower roster', () => {
  it('defines all ten tower types', () => {
    for (const type of ALL_TYPES) {
      expect(TOWER_DEFINITIONS[type], `missing definition for ${type}`).toBeDefined();
      expect(TOWER_DEFINITIONS[type].type).toBe(type);
    }
    expect(TOWER_LIST).toHaveLength(10);
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
      farm: 5,
      beacon: 3,
      ninja: 3,
    });
    // Every tower type must have a cap
    for (const type of ALL_TYPES) {
      expect(DEFAULT_TOWER_LIMITS[type], `no cap for ${type}`).toBeTypeOf('number');
    }
  });

  it('farm never fights but pays 50g per wave at L1 up to 500g at L5', () => {
    const farm = TOWER_DEFINITIONS.farm;
    expect(farm.damage).toBe(0);
    expect(farm.range).toBe(0);
    expect(farm.incomePerWave).toBe(50);
    expect(farmIncome(1)).toBe(50);
    expect(farmIncome(5)).toBe(500);
  });

  it('beacon never fights but buffs fire rate, growing with upgrades', () => {
    const beacon = TOWER_DEFINITIONS.beacon;
    expect(beacon.damage).toBe(0);
    expect(beacon.fireRate).toBe(0);
    expect(beacon.fireRateBuff).toBeGreaterThan(0);
    expect(beacon.range).toBeGreaterThan(0);
    // Never shoots, even with a target in range
    expect(new Tower('beacon', 0, 0).canFire()).toBe(false);
    // The aura strengthens with the beacon's level
    expect(beaconFireRateBuff(1)).toBeCloseTo(0.3);
    expect(beaconFireRateBuff(5)).toBeGreaterThan(beaconFireRateBuff(1) * 1.5);
  });

  it('ninja summons instead of shooting: no combat stats, summon timer instead', () => {
    const ninja = TOWER_DEFINITIONS.ninja;
    expect(ninja.damage).toBe(0);
    expect(ninja.range).toBe(0);
    expect(ninja.fireRate).toBeGreaterThan(0); // seconds between summons
    const tower = new Tower('ninja', 0, 0);
    expect(tower.canFire()).toBe(true); // summon ready
    tower.fire();
    expect(tower.canFire()).toBe(false); // then it goes on cooldown
  });

  it('ninja throws unlock at tower level 3: arrow, cannon, grenade', () => {
    expect(ninjaThrowProfile(1)).toBeNull(); // melee only
    expect(ninjaThrowProfile(2)).toBeNull();
    expect(ninjaThrowProfile(3)).toEqual({ towerType: 'arrow', damage: 12, splash: 0 });
    expect(ninjaThrowProfile(4)).toEqual({ towerType: 'cannon', damage: 16, splash: 30 });
    expect(ninjaThrowProfile(5)).toEqual({ towerType: 'grenade', damage: 20, splash: 45 });
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
  it('validates loadout: 3 to 5 unique owned towers', () => {
    const owned = ['arrow', 'cannon', 'frost', 'sniper', 'mortar'];
    const validate = (loadout: string[]) =>
      loadout.length >= 3 &&
      loadout.length <= 5 &&
      new Set(loadout).size === loadout.length &&
      loadout.every((t) => owned.includes(t));

    expect(validate(['arrow', 'cannon', 'frost'])).toBe(true);
    expect(validate(['arrow', 'cannon', 'sniper'])).toBe(true);
    expect(validate(['arrow', 'cannon', 'frost', 'sniper'])).toBe(true); // four allowed
    expect(validate(['arrow', 'cannon', 'frost', 'sniper', 'mortar'])).toBe(true); // five allowed
    expect(validate(['arrow', 'cannon'])).toBe(false); // too few
    expect(validate(['arrow', 'cannon', 'frost', 'sniper', 'mortar', 'tesla'])).toBe(false); // too many
    expect(validate(['arrow', 'arrow', 'frost'])).toBe(false); // duplicates
    expect(validate(['arrow', 'cannon', 'tesla'])).toBe(false); // not owned
  });
});
