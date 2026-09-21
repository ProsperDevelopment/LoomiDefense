import { Grid } from './Grid';

interface PathNode {
  col: number;
  row: number;
  g: number; // cost from start
  h: number; // heuristic to end
  f: number; // g + h
  parent: PathNode | null;
}

/**
 * A* pathfinding on the tile grid.
 * Falls back to pre-computed paths from map data.
 */
export class Pathfinding {
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  /**
   * Find path from start to end using A*.
   * Returns array of grid coordinates, or null if no path.
   */
  findPath(
    startCol: number,
    startRow: number,
    endCol: number,
    endRow: number,
  ): { col: number; row: number }[] | null {
    const open: PathNode[] = [];
    const closed = new Set<string>();

    const key = (c: number, r: number) => `${c},${r}`;
    const h = (c: number, r: number) =>
      Math.abs(c - endCol) + Math.abs(r - endRow);

    const startNode: PathNode = {
      col: startCol,
      row: startRow,
      g: 0,
      h: h(startCol, startRow),
      f: h(startCol, startRow),
      parent: null,
    };

    open.push(startNode);

    const directions = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 },
    ];

    while (open.length > 0) {
      // Find node with lowest f
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;

      if (current.col === endCol && current.row === endRow) {
        // Reconstruct path
        const path: { col: number; row: number }[] = [];
        let node: PathNode | null = current;
        while (node) {
          path.unshift({ col: node.col, row: node.row });
          node = node.parent;
        }
        return path;
      }

      closed.add(key(current.col, current.row));

      for (const { dc, dr } of directions) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        const k = key(nc, nr);

        if (closed.has(k)) continue;

        const cell = this.grid.getCell(nc, nr);
        // Can walk on path, spawn, base cells (and empty for flexibility)
        if (cell === 'tower' || cell === 'blocked') continue;

        const g = current.g + 1;
        const existing = open.find(n => n.col === nc && n.row === nr);

        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + existing.h;
            existing.parent = current;
          }
        } else {
          const node: PathNode = {
            col: nc,
            row: nr,
            g,
            h: h(nc, nr),
            f: g + h(nc, nr),
            parent: current,
          };
          open.push(node);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get pre-computed pixel path from map data.
   */
  getPrecomputedPath(): { x: number; y: number }[] {
    return this.grid.getPathPixels();
  }
}
