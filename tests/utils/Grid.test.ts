import { describe, it, expect, beforeEach } from 'vitest';
import { Grid } from '../../src/utils/Grid';
import type { MapData, CellType } from '../../src/types';

const testMap: MapData = {
  id: 1,
  name: 'Test',
  description: 'Test map',
  width: 4,
  height: 3,
  cellSize: 48,
  grid: [
    ['empty', 'empty', 'empty', 'empty'],
    ['spawn', 'path', 'path', 'base'],
    ['empty', 'empty', 'empty', 'empty'],
  ],
  spawnPoints: [{ x: 0, y: 1 }],
  basePath: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
};

describe('Grid', () => {
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(testMap);
  });

  it('has correct dimensions', () => {
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(3);
    expect(grid.cellSize).toBe(48);
  });

  it('gets cell type correctly', () => {
    expect(grid.getCell(0, 0)).toBe('empty');
    expect(grid.getCell(0, 1)).toBe('spawn');
    expect(grid.getCell(1, 1)).toBe('path');
    expect(grid.getCell(3, 1)).toBe('base');
  });

  it('returns blocked for out-of-bounds', () => {
    expect(grid.getCell(-1, 0)).toBe('blocked');
    expect(grid.getCell(10, 0)).toBe('blocked');
    expect(grid.getCell(0, 10)).toBe('blocked');
  });

  it('can place tower on empty cell', () => {
    expect(grid.canPlace(0, 0)).toBe(true);
  });

  it('cannot place tower on path', () => {
    expect(grid.canPlace(1, 1)).toBe(false);
  });

  it('places tower successfully', () => {
    const result = grid.placeTower(0, 0);
    expect(result).toBe(true);
    expect(grid.getCell(0, 0)).toBe('tower');
  });

  it('rejects placement on occupied cell', () => {
    grid.placeTower(0, 0);
    const result = grid.placeTower(0, 0);
    expect(result).toBe(false);
  });

  it('removes tower', () => {
    grid.placeTower(0, 0);
    grid.removeTower(0, 0);
    expect(grid.getCell(0, 0)).toBe('empty');
  });

  it('converts grid to world coordinates', () => {
    const pos = grid.gridToWorld(1, 2);
    expect(pos.x).toBe(1 * 48 + 24);
    expect(pos.y).toBe(2 * 48 + 24 + 48); // +48 for GRID_OFFSET_Y
  });

  it('converts world to grid coordinates', () => {
    const gc = grid.worldToGrid(50, 148); // 100 + 48 for GRID_OFFSET_Y
    expect(gc.col).toBe(1);
    expect(gc.row).toBe(2);
  });

  it('gets spawn pixels', () => {
    const spawns = grid.getSpawnPixels();
    expect(spawns).toHaveLength(1);
    expect(spawns[0].x).toBe(24); // col 0 * 48 + 24
    expect(spawns[0].y).toBe(1 * 48 + 24 + 48); // +48 for GRID_OFFSET_Y
  });

  it('gets path pixels', () => {
    const path = grid.getPathPixels();
    expect(path).toHaveLength(4);
  });

  it('resets grid to original state', () => {
    grid.placeTower(0, 0);
    grid.reset();
    expect(grid.getCell(0, 0)).toBe('empty');
  });

  it('returns map data', () => {
    expect(grid.getMapData()).toBe(testMap);
  });
});
