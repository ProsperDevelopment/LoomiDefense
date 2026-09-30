// ============================================================
// Damage eligibility rules (pure, testable).
// ============================================================

export interface DamageableEnemyData {
  invisible?: boolean;
}

/**
 * Can this tower damage this enemy?
 *
 * Normal enemies: always.
 * Invisible enemies (Phantoms): only an UPGRADED sniper or archer
 * (tower level 2+) can harm them — everything else passes through.
 */
export function canDamageEnemy(
  towerType: string,
  towerLevel: number,
  enemy: DamageableEnemyData,
): boolean {
  if (!enemy.invisible) return true;
  const isSniperOrArcher = towerType === 'sniper' || towerType === 'arrow';
  return isSniperOrArcher && towerLevel >= 2;
}
