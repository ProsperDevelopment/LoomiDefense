/**
 * Health component - tracks current/max HP and status effects.
 */
export class Health {
  current: number;
  max: number;
  armor: number = 0;

  // Status effects
  slowFactor: number = 1.0;
  slowTimer: number = 0;

  constructor(maxHp: number, armor: number = 0) {
    this.max = maxHp;
    this.current = maxHp;
    this.armor = armor;
  }

  takeDamage(amount: number): number {
    const effective = Math.max(0, amount - this.armor);
    this.current = Math.max(0, this.current - effective);
    return effective;
  }

  isDead(): boolean {
    return this.current <= 0;
  }

  applySlow(factor: number, durationMs: number): void {
    // Only apply if this slow is stronger
    if (factor < this.slowFactor || this.slowTimer <= 0) {
      this.slowFactor = factor;
      this.slowTimer = durationMs;
    }
  }

  updateStatusEffects(deltaMs: number): void {
    if (this.slowTimer > 0) {
      this.slowTimer -= deltaMs;
      if (this.slowTimer <= 0) {
        this.slowFactor = 1.0;
        this.slowTimer = 0;
      }
    }
  }

  getHealthPercent(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }

  reset(maxHp: number, armor: number = 0): void {
    this.max = maxHp;
    this.current = maxHp;
    this.armor = armor;
    this.slowFactor = 1.0;
    this.slowTimer = 0;
  }
}
