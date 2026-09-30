import { describe, it, expect, beforeEach } from 'vitest';
import { Pathfinding } from '../../src/utils/Pathfinding';
import { Grid } from '../../src/utils/Grid';
import type { MapData } from '../../src/types';

const testMap: MapData = {
  id: 1,
  name: 'PathTest',
  description: 'Pathfinding test map',
  width: 5,
  height: 3,
  cellSize: 48,
  grid: [
    ['empty', 'empty', 'empty', 'empty', 'empty'],
    ['spawn', 'path', 'empty', 'path', 'base'],
    ['empty', 'empty', 'empty', 'empty', 'empty'],
  ],
  spawnPoints: [{ x: 0, y: 1 }],
  basePath: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
};

describe('Pathfinding', () => {
  let grid: Grid;
  let pf: Pathfinding;

  beforeEach(() => {
    grid = new Grid(testMap);
    pf = new Pathfinding(grid);
  });

  it('finds a simple path', () => {
    const path = pf.findPath(0, 1, 4, 1);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ col: 0, row: 1 });
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 1 });
  });

  it('returns null when no path exists', () => {
    // Create a map with walls blocking all paths
    const wallMap: MapData = {
      ...testMap,
      grid: [
        ['empty', 'blocked', 'empty', 'blocked', 'empty'],
        ['spawn', 'blocked', 'empty', 'blocked', 'base'],
        ['empty', 'blocked', 'empty', 'blocked', 'empty'],
      ],
    };
    const wallGrid = new Grid(wallMap);
    const wallPF = new Pathfinding(wallGrid);
    const path = wallPF.findPath(0, 1, 4, 1);
    expect(path).toBeNull();
  });

  it('path avoids tower cells', () => {
    // Pathfinding works on logical cells; towers now live on the
    // background grid, so mark the logical cells directly here.
    grid.setCell(2, 0, 'tower');
    grid.setCell(2, 1, 'tower');
    const path = pf.findPath(0, 1, 4, 1);
    expect(path).not.toBeNull();
    // Path should go around the towers
    if (path) {
      const hasTower = path.some(p => p.col === 2 && p.row === 1);
      expect(hasTower).toBe(false);
    }
  });

  it('returns pre-computed path from map data', () => {
    const path = pf.getPrecomputedPath();
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual({ x: 24, y: 72 + 48 }); // gridToWorld(0,1) with GRID_OFFSET_Y
  });

  it('finds path when start equals end', () => {
    const path = pf.findPath(0, 0, 0, 0);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(1);
    expect(path![0]).toEqual({ col: 0, row: 0 });
  });
});
