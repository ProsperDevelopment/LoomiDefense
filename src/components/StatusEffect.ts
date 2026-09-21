/**
 * Status effect types that can be applied to enemies.
 */
export enum StatusEffectType {
  SLOW = 'slow',
  POISON = 'poison',
  STUN = 'stun',
}

export interface StatusEffect {
  type: StatusEffectType;
  factor: number;    // e.g. 0.5 = 50% slow
  duration: number;  // remaining ms
  tickDamage: number; // damage per tick (for poison)
}

/**
 * Manages status effects on an entity.
 */
export class StatusEffectManager {
  effects: StatusEffect[] = [];

  addEffect(type: StatusEffectType, factor: number, duration: number, tickDamage: number = 0): void {
    // Replace existing effect of same type
    const existing = this.effects.find(e => e.type === type);
    if (existing) {
      existing.factor = factor;
      existing.duration = duration;
      existing.tickDamage = tickDamage;
    } else {
      this.effects.push({ type, factor, duration, tickDamage });
    }
  }

  update(deltaMs: number): number {
    let totalTickDamage = 0;

    for (const effect of this.effects) {
      effect.duration -= deltaMs;
      if (effect.type === StatusEffectType.POISON && effect.tickDamage > 0) {
        totalTickDamage += effect.tickDamage * (deltaMs / 1000);
      }
    }

    this.effects = this.effects.filter(e => e.duration > 0);
    return totalTickDamage;
  }

  getSlowFactor(): number {
    let factor = 1.0;
    for (const effect of this.effects) {
      if (effect.type === StatusEffectType.SLOW) {
        factor = Math.min(factor, effect.factor);
      }
    }
    return factor;
  }

  hasEffect(type: StatusEffectType): boolean {
    return this.effects.some(e => e.type === type);
  }

  clear(): void {
    this.effects = [];
  }
}
