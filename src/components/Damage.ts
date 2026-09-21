/**
 * Damage component - stores base damage value and type.
 */
export class Damage {
  baseDamage: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;

  constructor(
    baseDamage: number,
    splashRadius: number = 0,
    slowFactor: number = 1.0,
    slowDuration: number = 0,
  ) {
    this.baseDamage = baseDamage;
    this.splashRadius = splashRadius;
    this.slowFactor = slowFactor;
    this.slowDuration = slowDuration;
  }

  reset(
    baseDamage: number,
    splashRadius: number = 0,
    slowFactor: number = 1.0,
    slowDuration: number = 0,
  ): void {
    this.baseDamage = baseDamage;
    this.splashRadius = splashRadius;
    this.slowFactor = slowFactor;
    this.slowDuration = slowDuration;
  }
}
