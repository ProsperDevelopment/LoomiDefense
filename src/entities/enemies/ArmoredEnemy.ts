import { Enemy } from '../Enemy';

/**
 * Armored Enemy - Slow speed, high HP, damage resistance.
 */
export class ArmoredEnemy extends Enemy {
  constructor(path: { x: number; y: number }[], id?: string) {
    super('armored', path, id);
  }
}
