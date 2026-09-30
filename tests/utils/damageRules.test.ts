// ============================================================
// Damage eligibility rules (phantom/invisible enemies).
// ============================================================
import { describe, it, expect } from 'vitest';
import { canDamageEnemy } from '../../src/utils/damageRules';

describe('canDamageEnemy', () => {
  it('always allows damage to normal enemies', () => {
    expect(canDamageEnemy('arrow', 1, {})).toBe(true);
    expect(canDamageEnemy('cannon', 1, {})).toBe(true);
    expect(canDamageEnemy('frost', 5, {})).toBe(true);
    expect(canDamageEnemy('sniper', 1, {})).toBe(true);
  });

  it('blocks everything except upgraded sniper/archer against invisible enemies', () => {
    const invisible = { invisible: true };
    // level 1 (not upgraded)
    expect(canDamageEnemy('arrow', 1, invisible)).toBe(false);
    expect(canDamageEnemy('sniper', 1, invisible)).toBe(false);
    // upgraded (level 2+)
    expect(canDamageEnemy('arrow', 2, invisible)).toBe(true);
    expect(canDamageEnemy('arrow', 5, invisible)).toBe(true);
    expect(canDamageEnemy('sniper', 2, invisible)).toBe(true);
    expect(canDamageEnemy('sniper', 5, invisible)).toBe(true);
    // never anything else — even fully upgraded
    for (const type of ['cannon', 'frost', 'mortar', 'tesla']) {
      expect(canDamageEnemy(type, 5, invisible)).toBe(false);
    }
  });

  it('treats a missing invisible flag as a normal enemy', () => {
    expect(canDamageEnemy('cannon', 1, { invisible: undefined })).toBe(true);
    expect(canDamageEnemy('cannon', 1, { invisible: false })).toBe(true);
  });
});
