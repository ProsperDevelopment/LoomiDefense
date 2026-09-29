// ============================================================
// Per-player economy: gold is never shared between players.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerEconomy } from '../../src/systems/PlayerEconomy';
import { EconomySystem } from '../../src/systems/EconomySystem';
import { eventBus } from '../../src/utils/EventBus';

describe('PlayerEconomy', () => {
  beforeEach(() => {
    eventBus.clear();
  });

  it('keeps each player on their own pot', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1'], 100);

    expect(econ.goldOf('host')).toBe(100);
    expect(econ.goldOf('guest1')).toBe(100);

    // Host spends: only host is affected
    expect(econ.spend('host', 50)).toBe(true);
    expect(econ.goldOf('host')).toBe(50);
    expect(econ.goldOf('guest1')).toBe(100);
    expect(local.getGold()).toBe(50);
  });

  it('rejects spending beyond the acting player\'s own balance', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1'], 30);

    expect(econ.spend('guest1', 40)).toBe(false); // guest only has 30
    expect(econ.goldOf('guest1')).toBe(30);
    expect(econ.spend('guest1', 30)).toBe(true);
    expect(econ.goldOf('guest1')).toBe(0);

    expect(econ.spend('host', 101)).toBe(false); // host only has 100
    expect(econ.goldOf('host')).toBe(100);
  });

  it('credits only the player who earned the gold', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1'], 100);

    econ.add('guest1', 50);
    expect(econ.goldOf('guest1')).toBe(150);
    expect(econ.goldOf('host')).toBe(100);

    econ.add('host', 25);
    expect(econ.goldOf('host')).toBe(125);
    expect(econ.goldOf('guest1')).toBe(150);
  });

  it('shares bonuses only through addAll (every pot grows)', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1', 'guest2'], 100);

    econ.addAll(25);
    expect(econ.goldOf('host')).toBe(125);
    expect(econ.goldOf('guest1')).toBe(125);
    expect(econ.goldOf('guest2')).toBe(125);
  });

  it('never lets a pot go negative', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1'], 10);

    // Ledger pots clamp at zero
    econ.add('guest1', -50);
    expect(econ.goldOf('guest1')).toBe(0);

    // Local pot never goes negative: oversized debits are refused
    econ.add('host', -500);
    expect(econ.goldOf('host')).toBe(100);
    expect(local.getGold()).toBe(100);

    econ.spend('host', 100);
    expect(econ.goldOf('host')).toBe(0);
    econ.add('host', -1);
    expect(econ.goldOf('host')).toBe(0);
  });

  it('solo mode uses the single local pot for everyone', () => {
    const local = new EconomySystem(200);
    const econ = new PlayerEconomy('me', local, false);

    econ.add('me', 50);
    expect(econ.goldOf('me')).toBe(250);
    expect(local.getGold()).toBe(250);
    expect(econ.spend('me', 300)).toBe(false);
  });

  it('exports every pot for the network snapshot', () => {
    const local = new EconomySystem(100);
    const econ = new PlayerEconomy('host', local, true, ['guest1'], 100);

    econ.add('guest1', 20);
    expect(econ.toRecord()).toEqual({ host: 100, guest1: 120 });
  });

  it('registers additional players at game start', () => {
    const local = new EconomySystem(150);
    const econ = new PlayerEconomy('host', local, true, [], 150);

    econ.addPlayer('guest1', 150);
    econ.addPlayer('host', 999); // ignored: local id never becomes a ledger entry
    expect(econ.goldOf('guest1')).toBe(150);
    expect(econ.toRecord()).toEqual({ host: 150, guest1: 150 });
  });
});
