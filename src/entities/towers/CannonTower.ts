import { Tower } from '../Tower';

/**
 * Cannon Tower - Slow fire rate, high damage, splash damage.
 */
export class CannonTower extends Tower {
  constructor(gridCol: number, gridRow: number, id?: string) {
    super('cannon', gridCol, gridRow, id);
  }
}
