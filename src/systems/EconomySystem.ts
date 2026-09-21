import type { TowerType, TowerUpgradeData } from '../types';
import { TOWER_DEFINITIONS, TOWER_UPGRADES } from '../data/towers';
import { STARTING_GOLD, SELL_REFUND_RATIO } from '../config/constants';
import { eventBus } from '../utils/EventBus';

/**
 * Manages the game economy: gold, tower costs, upgrades, selling.
 */
export class EconomySystem {
  private gold: number;

  constructor(startingGold: number = STARTING_GOLD) {
    this.gold = startingGold;
  }

  getGold(): number {
    return this.gold;
  }

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  spend(amount: number): boolean {
    if (this.gold >= amount) {
      this.gold -= amount;
      eventBus.emit('gold-changed', { amount: -amount, total: this.gold });
      return true;
    }
    return false;
  }

  earn(amount: number): void {
    this.gold += amount;
    eventBus.emit('gold-changed', { amount, total: this.gold });
  }

  getTowerCost(towerType: TowerType): number {
    return TOWER_DEFINITIONS[towerType]?.cost ?? 0;
  }

  getUpgradeCost(towerType: TowerType, currentLevel: number): number {
    const baseCost = this.getTowerCost(towerType);
    const upgradeData = TOWER_UPGRADES[currentLevel]; // next level
    if (!upgradeData) return Infinity;
    return Math.floor(baseCost * upgradeData.costMultiplier);
  }

  getSellValue(towerType: TowerType, level: number = 1): number {
    const baseCost = this.getTowerCost(towerType);
    let totalInvested = baseCost;

    for (let i = 1; i < level; i++) {
      const upg = TOWER_UPGRADES[i];
      if (upg) {
        totalInvested += Math.floor(baseCost * upg.costMultiplier);
      }
    }

    return Math.floor(totalInvested * SELL_REFUND_RATIO);
  }

  getUpgradeData(level: number): TowerUpgradeData | null {
    return TOWER_UPGRADES[level] ?? null;
  }

  reset(startingGold: number = STARTING_GOLD): void {
    this.gold = startingGold;
  }
}
