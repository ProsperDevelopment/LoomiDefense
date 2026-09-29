import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EconomySystem } from '../../src/systems/EconomySystem';
import { eventBus } from '../../src/utils/EventBus';

describe('EconomySystem', () => {
  let eco: EconomySystem;

  beforeEach(() => {
    eco = new EconomySystem(100);
    eventBus.clear();
  });

  it('starts with correct gold', () => {
    expect(eco.getGold()).toBe(100);
  });

  it('can afford items within budget', () => {
    expect(eco.canAfford(50)).toBe(true);
    expect(eco.canAfford(100)).toBe(true);
    expect(eco.canAfford(101)).toBe(false);
  });

  it('spends gold correctly', () => {
    const result = eco.spend(30);
    expect(result).toBe(true);
    expect(eco.getGold()).toBe(70);
  });

  it('rejects spending when insufficient', () => {
    const result = eco.spend(200);
    expect(result).toBe(false);
    expect(eco.getGold()).toBe(100);
  });

  it('earns gold correctly', () => {
    eco.earn(50);
    expect(eco.getGold()).toBe(150);
  });

  it('emits gold-changed events', () => {
    const spy = vi.fn();
    eventBus.on('gold-changed', spy);
    eco.spend(30);
    expect(spy).toHaveBeenCalledWith({ amount: -30, total: 70 });
    eventBus.off('gold-changed', spy);
  });

  it('gets tower costs', () => {
    expect(eco.getTowerCost('arrow')).toBe(50);
    expect(eco.getTowerCost('cannon')).toBe(100);
    expect(eco.getTowerCost('frost')).toBe(75);
  });

  it('calculates upgrade cost', () => {
    const cost = eco.getUpgradeCost('arrow', 1);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns Infinity for max level upgrade', () => {
    const cost = eco.getUpgradeCost('arrow', 5);
    expect(cost).toBe(Infinity);
  });

  it('calculates sell value with refund ratio', () => {
    const sellValue = eco.getSellValue('arrow', 1);
    expect(sellValue).toBe(Math.floor(50 * 0.6)); // 30
  });

  it('resets correctly', () => {
    eco.spend(50);
    eco.reset(200);
    expect(eco.getGold()).toBe(200);
  });

  it('gets upgrade data', () => {
    const data = eco.getUpgradeData(1);
    expect(data).not.toBeNull();
    expect(data?.level).toBe(2);
  });

  it('returns null for invalid upgrade level', () => {
    const data = eco.getUpgradeData(10);
    expect(data).toBeNull();
  });
});
