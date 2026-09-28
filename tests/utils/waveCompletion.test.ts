// ============================================================
// Wave completion rules: all enemies must spawn AND resolve.
// ============================================================
import { describe, it, expect } from 'vitest';
import { isWaveResolved } from '../../src/utils/waveCompletion';

describe('isWaveResolved', () => {
  it('is not resolved while enemies are still on the field', () => {
    expect(
      isWaveResolved({ spawned: 10, total: 10, remainingEnemies: 1 }),
    ).toBe(false);
  });

  it('is not resolved while enemies are still spawning', () => {
    expect(
      isWaveResolved({ spawned: 3, total: 10, remainingEnemies: 0 }),
    ).toBe(false);
  });

  it('is resolved when all spawned and none remain', () => {
    expect(
      isWaveResolved({ spawned: 10, total: 10, remainingEnemies: 0 }),
    ).toBe(true);
  });

  it('never finishes early even if the spawn counter over-counts', () => {
    // The old bug: a double-decremented alive counter made this look done
    // while 5 enemies were still walking.
    expect(
      isWaveResolved({ spawned: 10, total: 10, remainingEnemies: 5 }),
    ).toBe(false);
  });

  it('waits for stragglers from earlier waves too', () => {
    expect(
      isWaveResolved({ spawned: 4, total: 4, remainingEnemies: 2 }),
    ).toBe(false);
    expect(
      isWaveResolved({ spawned: 4, total: 4, remainingEnemies: 0 }),
    ).toBe(true);
  });

  it('tolerates an over-counted spawn total (extra spawns beyond plan)', () => {
    expect(
      isWaveResolved({ spawned: 12, total: 10, remainingEnemies: 0 }),
    ).toBe(true);
  });
});
