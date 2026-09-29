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

describe('Grid area layer', () => {
  const areaMap: MapData = {
    ...testMap,
    areas: [
      ['tree', 'wall', 'roof', 'none'],
      ['none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none'],
    ],
  };
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(areaMap);
  });

  it('reports the area type of a cell', () => {
    expect(grid.getArea(0, 0)).toBe('tree');
    expect(grid.getArea(1, 0)).toBe('wall');
    expect(grid.getArea(2, 0)).toBe('roof');
    expect(grid.getArea(3, 0)).toBe('none');
    expect(grid.getArea(-1, 0)).toBe('none');
    expect(grid.getArea(0, 99)).toBe('none');
  });

  it('defaults to no areas when the map has none', () => {
    const g = new Grid(testMap);
    expect(g.getArea(0, 0)).toBe('none');
    expect(g.canPlace(0, 0, 'arrow')).toBe(true);
  });

  it('blocks all building on trees and walls', () => {
    expect(grid.canPlace(0, 0)).toBe(false);          // generic gate
    expect(grid.canPlace(0, 0, 'arrow')).toBe(false);
    expect(grid.canPlace(0, 0, 'sniper')).toBe(false);
    expect(grid.canPlace(1, 0, 'arrow')).toBe(false);
    expect(grid.canPlace(1, 0, 'sniper')).toBe(false);
    expect(grid.placeTower(0, 0, 'arrow')).toBe(false);
    expect(grid.placeTower(1, 0, 'sniper')).toBe(false);
  });

  it('allows ONLY the sniper on a roof', () => {
    expect(grid.canPlace(2, 0, 'sniper')).toBe(true);
    expect(grid.placeTower(2, 0, 'sniper')).toBe(true);
    expect(grid.getCell(2, 0)).toBe('tower');
  });

  it('keeps other towers off roofs', () => {
    expect(grid.canPlace(2, 0, 'arrow')).toBe(false);
    expect(grid.canPlace(2, 0, 'cannon')).toBe(false);
    expect(grid.canPlace(2, 0, 'frost')).toBe(false);
    expect(grid.canPlace(2, 0, 'mortar')).toBe(false);
    expect(grid.canPlace(2, 0, 'tesla')).toBe(false);
  });

  it('keeps snipers off normal ground', () => {
    expect(grid.canPlace(3, 0, 'sniper')).toBe(false);   // plain empty cell
    expect(grid.canPlace(3, 2, 'sniper')).toBe(false);   // another empty cell
    expect(grid.placeTower(3, 2, 'sniper')).toBe(false);
    // ...but other towers are fine there
    expect(grid.canPlace(3, 2, 'arrow')).toBe(true);
  });
});
