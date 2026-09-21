import type { EnemyData } from '../types';

export const ENEMY_DEFINITIONS: Record<string, EnemyData> = {
  basic: {
    type: 'basic',
    name: 'Ant',
    hp: 100,
    speed: 60,
    armor: 0,
    reward: 10,
    color: '#cc4422',
    size: 8,
  },
  fast: {
    type: 'fast',
    name: 'Bat',
    hp: 60,
    speed: 120,
    armor: 0,
    reward: 15,
    color: '#444466',
    size: 16,
  },
  armored: {
    type: 'armored',
    name: 'Demon',
    hp: 300,
    speed: 35,
    armor: 5,
    reward: 30,
    color: '#cc2222',
    size: 16,
  },
};

export const ENEMY_LIST = Object.values(ENEMY_DEFINITIONS);
