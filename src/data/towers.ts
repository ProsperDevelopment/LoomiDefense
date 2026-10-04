import type { TowerData, TowerUpgradeData, TowerType } from '../types';

export const TOWER_DEFINITIONS: Record<string, TowerData> = {
  arrow: {
    type: 'arrow',
    name: 'Arrow Tower',
    cost: 50,
    damage: 4,
    fireRate: 1.8,
    range: 120,
    splashRadius: 0,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#4CAF50',
    description: 'Fast fire rate, single target',
  },
  cannon: {
    type: 'cannon',
    name: 'Cannon Tower',
    cost: 100,
    damage: 22,
    fireRate: 0.6,
    range: 105,
    splashRadius: 60,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#FF5722',
    description: 'Slow fire rate, high splash damage',
  },
  frost: {
    type: 'frost',
    name: 'Frost Tower',
    cost: 75,
    damage: 2,
    fireRate: 1.1,
    range: 95,
    splashRadius: 50,
    slowFactor: 0.4,
    slowDuration: 2000,
    color: '#2196F3',
    description: 'Slows enemies, area effect',
  },
  sniper: {
    type: 'sniper',
    name: 'Sniper Tower',
    cost: 110,
    damage: 63,
    fireRate: 0.3,
    range: 270,
    splashRadius: 0,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#8BC34A',
    description: 'Huge range, massive single-target damage',
  },
  mortar: {
    type: 'mortar',
    name: 'Mortar Tower',
    cost: 150,
    damage: 31,
    fireRate: 0.4,
    range: 200,
    splashRadius: 90,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#FF9800',
    description: 'Long range artillery with big splash',
  },
  tesla: {
    type: 'tesla',
    name: 'Tesla Tower',
    cost: 125,
    damage: 4,
    fireRate: 3,
    range: 110,
    splashRadius: 45,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#00BCD4',
    description: 'Rapid fire chain lightning',
  },
  grenade: {
    type: 'grenade',
    name: 'Grenade Tower',
    cost: 140,
    damage: 18,
    fireRate: 0.5,
    range: 170,
    splashRadius: 40,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#9E9D24',
    description: 'Lobs grenades that burst into shrapnel',
    shrapnelCount: 5,
  },
  farm: {
    type: 'farm',
    name: 'Farm Tower',
    cost: 100,
    damage: 0,
    fireRate: 0,
    range: 0,
    splashRadius: 0,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#66BB6A',
    description: 'Generates gold each wave instead of shooting',
    incomePerWave: 50,
  },
  beacon: {
    type: 'beacon',
    name: 'Beacon Tower',
    cost: 120,
    damage: 0,
    fireRate: 0,
    range: 150,
    splashRadius: 0,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#FDD835',
    description: 'Boosts the fire rate of towers in its range',
    fireRateBuff: 0.3,
  },
  ninja: {
    type: 'ninja',
    name: 'Ninja Tower',
    cost: 150,
    damage: 0,
    fireRate: 0.25,   // seconds between summons (one ninja every 4s)
    range: 0,         // summons at the base — never shoots
    splashRadius: 0,
    slowFactor: 1.0,
    slowDuration: 0,
    color: '#37474F',
    description: 'Summons ninjas from your base that fight along the path',
  },
};

export const TOWER_UPGRADES: TowerUpgradeData[] = [
  { level: 1, costMultiplier: 1.0, damageMultiplier: 1.0, rangeMultiplier: 1.0, fireRateMultiplier: 1.0 },
  { level: 2, costMultiplier: 1.5, damageMultiplier: 1.5, rangeMultiplier: 1.1, fireRateMultiplier: 1.2 },
  { level: 3, costMultiplier: 2.5, damageMultiplier: 2.2, rangeMultiplier: 1.25, fireRateMultiplier: 1.4 },
  { level: 4, costMultiplier: 4.0, damageMultiplier: 3.0, rangeMultiplier: 1.35, fireRateMultiplier: 1.6 },
  { level: 5, costMultiplier: 6.0, damageMultiplier: 4.0, rangeMultiplier: 1.45, fireRateMultiplier: 1.8 },
];

/** Highest level a tower can reach (TOWER_UPGRADES is indexed by current level). */
export const MAX_TOWER_LEVEL = TOWER_UPGRADES[TOWER_UPGRADES.length - 1].level;

export const TOWER_LIST = Object.values(TOWER_DEFINITIONS);

/** Farm income multipliers per upgrade level: 50g at L1 up to 500g at L5. */
const FARM_INCOME_SCALE = [1, 3, 5, 7, 10];

/** Gold a Farm pays its owner when a wave starts. */
export function farmIncome(level: number): number {
  const base = TOWER_DEFINITIONS.farm?.incomePerWave ?? 50;
  return base * (FARM_INCOME_SCALE[Math.min(level, FARM_INCOME_SCALE.length) - 1] ?? 1);
}

/** Fire-rate aura of a Beacon: +30% at L1 up to +54% at L5. */
export function beaconFireRateBuff(level: number): number {
  const base = TOWER_DEFINITIONS.beacon?.fireRateBuff ?? 0;
  const up = TOWER_UPGRADES[Math.min(Math.max(level, 1), MAX_TOWER_LEVEL) - 1];
  return base * (up?.fireRateMultiplier ?? 1);
}

/** The three basic towers — their combined build budget is shared. */
export const BASIC_TOWERS: TowerType[] = ['arrow', 'cannon', 'frost'];

/**
 * Default per-type build caps. Levels can override any of them via the
 * optional `towerLimits` map in their JSON.
 */
export const DEFAULT_TOWER_LIMITS: Record<TowerType, number> = {
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
};
