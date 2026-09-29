// ============================================================
// Difficulty tiers decide the starting lives for a level.
// ============================================================
import { describe, it, expect } from 'vitest';
import { DIFFICULTY_LIVES, livesForDifficulty } from '../../src/config/constants';

describe('difficulty lives', () => {
  it('gives 20 lives on easy', () => {
    expect(DIFFICULTY_LIVES.easy).toBe(20);
    expect(livesForDifficulty('easy')).toBe(20);
  });

  it('gives 5 lives on medium', () => {
    expect(DIFFICULTY_LIVES.medium).toBe(5);
    expect(livesForDifficulty('medium')).toBe(5);
  });

  it('gives 1 life on hard', () => {
    expect(DIFFICULTY_LIVES.hard).toBe(1);
    expect(livesForDifficulty('hard')).toBe(1);
  });

  it('defaults to easy when the level has no difficulty', () => {
    expect(livesForDifficulty(undefined)).toBe(20);
  });
});
