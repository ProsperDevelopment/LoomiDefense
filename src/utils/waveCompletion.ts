// ============================================================
// Wave completion predicate.
// ============================================================

/**
 * A wave may only be completed when:
 *  - every enemy of the wave has spawned, AND
 *  - no enemies remain on the field (each one was either killed
 *    or reached the base — both remove it from the enemy list).
 *
 * `remainingEnemies` counts the whole live list, so stragglers from
 * previous waves also have to be resolved before finishing.
 */
export function isWaveResolved(params: {
  spawned: number;
  total: number;
  remainingEnemies: number;
}): boolean {
  return params.spawned >= params.total && params.remainingEnemies <= 0;
}
