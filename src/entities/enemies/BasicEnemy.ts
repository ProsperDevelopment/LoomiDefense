import { Enemy } from '../Enemy';

/**
 * Basic Enemy - Normal speed, normal HP.
 */
export class BasicEnemy extends Enemy {
  constructor(path: { x: number; y: number }[], id?: string) {
    super('basic', path, id);
  }
}
