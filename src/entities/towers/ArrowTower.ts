import { Tower } from '../Tower';

/**
 * Arrow Tower - Fast fire rate, low damage, single target.
 */
export class ArrowTower extends Tower {
  constructor(gridCol: number, gridRow: number, id?: string) {
    super('arrow', gridCol, gridRow, id);
  }
}
