import { Enemy } from '../Enemy';

/**
 * Fast Enemy - High speed, low HP.
 */
export class FastEnemy extends Enemy {
  constructor(path: { x: number; y: number }[], id?: string) {
    super('fast', path, id);
  }
}
