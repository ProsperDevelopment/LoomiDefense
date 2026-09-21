import type { TowerData, TowerUpgradeData } from '../types';

export const TOWER_DEFINITIONS: Record<string, TowerData> = {
  arrow: {
    type: 'arrow',
    name: 'Arrow Tower',
    cost: 50,
    damage: 10,
    fireRate: 2.5,
    range: 150,
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
    damage: 40,
    fireRate: 0.8,
    range: 130,
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
    damage: 5,
    fireRate: 1.5,
    range: 120,
    splashRadius: 50,
    slowFactor: 0.4,
    slowDuration: 2000,
    color: '#2196F3',
    description: 'Slows enemies, area effect',
  },
};

export const TOWER_UPGRADES: TowerUpgradeData[] = [
  { level: 1, costMultiplier: 1.0, damageMultiplier: 1.0, rangeMultiplier: 1.0, fireRateMultiplier: 1.0 },
  { level: 2, costMultiplier: 1.5, damageMultiplier: 1.5, rangeMultiplier: 1.1, fireRateMultiplier: 1.2 },
  { level: 3, costMultiplier: 2.5, damageMultiplier: 2.2, rangeMultiplier: 1.25, fireRateMultiplier: 1.4 },
];

export const TOWER_LIST = Object.values(TOWER_DEFINITIONS);
