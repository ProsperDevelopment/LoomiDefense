import type { EnemyData } from '../types';

export const ENEMY_DEFINITIONS: Record<string, EnemyData> = {
  // Early game (Levels 1-5)
  basic: {
    type: 'basic',
    name: 'Ant',
    hp: 80,
    speed: 60,
    armor: 0,
    reward: 10,
    color: '#cc4422',
    size: 8,
  },
  fast: {
    type: 'fast',
    name: 'Bat',
    hp: 50,
    speed: 120,
    armor: 0,
    reward: 12,
    color: '#444466',
    size: 16,
    immuneTo: ['cannon'],
  },
  // Mid game (Levels 6-12)
  armored: {
    type: 'armored',
    name: 'Demon',
    hp: 250,
    speed: 35,
    armor: 5,
    reward: 25,
    color: '#cc2222',
    size: 16,
  },
  healer: {
    type: 'healer',
    name: 'Shaman',
    hp: 120,
    speed: 50,
    armor: 0,
    reward: 20,
    color: '#22cc44',
    size: 14,
    immuneTo: ['frost'],
  },
  // Late game (Levels 13-20)
  swarm: {
    type: 'swarm',
    name: 'Locust',
    hp: 30,
    speed: 100,
    armor: 0,
    reward: 5,
    color: '#cccc22',
    size: 6,
    immuneTo: ['cannon'],
  },
  tank: {
    type: 'tank',
    name: 'Golem',
    hp: 600,
    speed: 25,
    armor: 10,
    reward: 50,
    color: '#8B4513',
    size: 20,
  },
  // End game (Levels 21-25)
  elite: {
    type: 'elite',
    name: 'Dark Knight',
    hp: 400,
    speed: 55,
    armor: 8,
    reward: 40,
    color: '#4a0080',
    size: 18,
    immuneTo: ['frost'],
  },
  boss: {
    type: 'boss',
    name: 'Dragon',
    hp: 2000,
    speed: 20,
    armor: 15,
    reward: 200,
    color: '#ff0000',
    size: 24,
  },
};

export const ENEMY_LIST = Object.values(ENEMY_DEFINITIONS);
