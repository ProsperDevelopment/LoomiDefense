// ============================================================
// Per-player gold for multiplayer: players never share economics.
//
// The local player's pot is backed by an EconomySystem (so existing
// HUD/event wiring keeps working); every other player's pot is a
// plain ledger entry validated by the host on each action.
// ============================================================
import { EconomySystem } from './EconomySystem';

export class PlayerEconomy {
  readonly localId: string;
  readonly local: EconomySystem;
  private readonly multiplayer: boolean;
  private readonly others = new Map<string, number>();

  constructor(
    localId: string,
    localEconomy: EconomySystem,
    multiplayer: boolean,
    otherPlayerIds: string[] = [],
    startingGold: number = 0,
  ) {
    this.localId = localId;
    this.local = localEconomy;
    this.multiplayer = multiplayer;
    for (const id of otherPlayerIds) {
      if (id !== localId) this.others.set(id, startingGold);
    }
  }

  /** Gold belonging to one specific player. */
  goldOf(playerId: string): number {
    if (!this.multiplayer || playerId === this.localId) {
      return this.local.getGold();
    }
    return this.others.get(playerId) ?? 0;
  }

  /** Credit a player's own pot (positive or negative amounts). */
  add(playerId: string, amount: number): void {
    if (amount === 0) return;
    if (!this.multiplayer || playerId === this.localId) {
      if (amount > 0) this.local.earn(amount);
      else this.local.spend(-amount);
      return;
    }
    const next = (this.others.get(playerId) ?? 0) + amount;
    this.others.set(playerId, Math.max(0, next));
  }

  /** Deduct from one player's pot. Returns false if they can't afford it. */
  spend(playerId: string, amount: number): boolean {
    if (this.goldOf(playerId) < amount) return false;
    this.add(playerId, -amount);
    return true;
  }

  /** Credit every player (e.g. shared wave-clear bonus). */
  addAll(amount: number): void {
    this.add(this.localId, amount);
    for (const id of this.others.keys()) this.add(id, amount);
  }

  /** Register another player's pot (host side, at game start). */
  addPlayer(playerId: string, startingGold: number): void {
    if (playerId !== this.localId) this.others.set(playerId, startingGold);
  }

  /** All pots for the network snapshot: { playerId: gold }. */
  toRecord(): Record<string, number> {
    return {
      [this.localId]: this.local.getGold(),
      ...Object.fromEntries(this.others),
    };
  }
}
