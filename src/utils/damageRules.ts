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

/**
 * Can a summoned ninja hurt this enemy with its CURRENT weapon?
 *
 * Melee contact (no throw profile) hurts anything it can touch; throws
 * follow the same rules as towers — arrows keep their privileges, so an
 * arrow-throwing ninja can target bats and phantoms, while cannon and
 * grenade throws skip anything they cannot hit (no wasted immune spam).
 */
export function canNinjaThrowHit(
  profile: { towerType: string } | null,
  towerLevel: number,
  enemy: DamageableEnemyData & { immuneTo?: string[] },
): boolean {
  if (!profile) return true;
  if (enemy.immuneTo?.includes(profile.towerType)) return false;
  return canDamageEnemy(profile.towerType, towerLevel, enemy);
}
