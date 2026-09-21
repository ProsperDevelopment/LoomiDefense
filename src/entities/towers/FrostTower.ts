import { Tower } from '../Tower';

/**
 * Frost Tower - Slows enemies, low damage, area effect.
 */
export class FrostTower extends Tower {
  constructor(gridCol: number, gridRow: number, id?: string) {
    super('frost', gridCol, gridRow, id);
  }
}
