import { describe, it, expect, beforeEach } from 'vitest';
import { Grid } from '../../src/utils/Grid';
import type { MapData } from '../../src/types';

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

  it('can place a tower on an empty background cell', () => {
    expect(grid.canPlaceAtBg(0, 0, 'arrow')).toBe(true);
  });

  it('cannot place a tower on the path', () => {
    // bg cells (2..3, 2..3) belong to logical path cell (1,1)
    expect(grid.canPlaceAtBg(2, 2, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(3, 3, 'arrow')).toBe(false);
  });

  it('cannot place a tower out of background-grid bounds', () => {
    expect(grid.canPlaceAtBg(-1, 0, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(8, 0, 'arrow')).toBe(false); // width*2
    expect(grid.canPlaceAtBg(0, 6, 'arrow')).toBe(false); // height*2
  });

  it('places a tower and keeps the logical cell empty', () => {
    expect(grid.placeTowerAtBg(0, 0, 'arrow')).toBe(true);
    expect(grid.canPlaceAtBg(0, 0, 'arrow')).toBe(false); // occupied
    expect(grid.getCell(0, 0)).toBe('empty'); // logical layer untouched
  });

  it('rejects overlapping towers but allows half-cell offsets', () => {
    grid.placeTowerAtBg(0, 0, 'arrow');
    // Adjacent cell (24px away) would overlap the 48px sprite
    expect(grid.canPlaceAtBg(1, 0, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(0, 1, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(1, 1, 'arrow')).toBe(false);
    // Two cells away (48px) — touching but not overlapping: allowed
    expect(grid.canPlaceAtBg(2, 0, 'arrow')).toBe(true);
    // Staggered background-grid offset also works
    expect(grid.canPlaceAtBg(2, 1, 'arrow')).toBe(true);
  });

  it('removes a tower', () => {
    grid.placeTowerAtBg(0, 0, 'arrow');
    grid.removeTowerAtBg(0, 0);
    expect(grid.canPlaceAtBg(0, 0, 'arrow')).toBe(true);
  });

  it('reports tower coverage (Chebyshev-1 footprint) for drip checks', () => {
    expect(grid.hasTowerAtBg(5, 5)).toBe(false);
    grid.placeTowerAtBg(4, 4, 'arrow');
    // covered: the tower cell and all 8 neighbours
    expect(grid.hasTowerAtBg(4, 4)).toBe(true);
    expect(grid.hasTowerAtBg(3, 3)).toBe(true);
    expect(grid.hasTowerAtBg(5, 5)).toBe(true);
    // not covered: two cells away (the tower sprite is 48px = 2 cells)
    expect(grid.hasTowerAtBg(6, 4)).toBe(false);
    expect(grid.hasTowerAtBg(4, 6)).toBe(false);
    // removing the tower clears the coverage
    grid.removeTowerAtBg(4, 4);
    expect(grid.hasTowerAtBg(4, 4)).toBe(false);
  });

  it('nearTower uses a narrow pixel radius (drip area)', () => {
    grid.placeTowerAtBg(4, 4, 'arrow');
    const cx = 4 * 24 + 12;          // tower center x
    const cy = 4 * 24 + 12 + 48;     // + GRID_OFFSET_Y

    // On the tower body: within the 16px drip radius
    expect(grid.nearTower(cx, cy)).toBe(true);
    expect(grid.nearTower(cx + 16, cy)).toBe(true);
    expect(grid.nearTower(cx, cy - 14)).toBe(true);
    // Just outside the drip radius (but still inside the 3x3 collision
    // footprint — collision stays conservative, dripping does not)
    expect(grid.nearTower(cx + 20, cy)).toBe(false);
    expect(grid.nearTower(cx + 24, cy + 24)).toBe(false);
    // Far from any tower
    expect(grid.nearTower(10, 58)).toBe(false);
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

  it('converts background cells to world coordinates (cell centers)', () => {
    const pos = grid.bgToWorld(0, 0);
    expect(pos.x).toBe(12); // 0 * 24 + 12
    expect(pos.y).toBe(12 + 48); // +48 for GRID_OFFSET_Y
    const pos2 = grid.bgToWorld(3, 1);
    expect(pos2.x).toBe(3 * 24 + 12);
    expect(pos2.y).toBe(1 * 24 + 12 + 48);
  });

  it('converts world to background grid coordinates', () => {
    const bg = grid.worldToBgGrid(30, 60); // y - 48 offset
    expect(bg.col).toBe(1); // 30 / 24
    expect(bg.row).toBe(0); // 12 / 24
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
    grid.placeTowerAtBg(0, 0, 'arrow');
    grid.reset();
    expect(grid.canPlaceAtBg(0, 0, 'arrow')).toBe(true);
  });

  it('returns map data', () => {
    expect(grid.getMapData()).toBe(testMap);
  });
});

describe('Grid area layer (background-grid resolution)', () => {
  // Areas at background resolution (2x grid): logical (0,0)=tree,
  // (1,0)=wall, (2,0)=roof → bg cells 0-1 / 2-3 / 4-5 of rows 0-1
  const areaMap: MapData = {
    ...testMap,
    areas: [
      ['tree', 'tree', 'wall', 'wall', 'roof', 'roof', 'none', 'none'],
      ['tree', 'tree', 'wall', 'wall', 'roof', 'roof', 'none', 'none'],
      ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
    ],
  };
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(areaMap);
  });

  it('reports the area type of a background cell', () => {
    expect(grid.getArea(0, 0)).toBe('tree');
    expect(grid.getArea(1, 1)).toBe('tree');
    expect(grid.getArea(2, 0)).toBe('wall');
    expect(grid.getArea(4, 0)).toBe('roof');
    expect(grid.getArea(6, 0)).toBe('none');
    expect(grid.getArea(-1, 0)).toBe('none');
    expect(grid.getArea(0, 99)).toBe('none');
  });

  it('defaults to no areas when the map has none', () => {
    const g = new Grid(testMap);
    expect(g.getArea(0, 0)).toBe('none');
    expect(g.canPlaceAtBg(0, 0, 'arrow')).toBe(true);
  });

  it('upgrades legacy grid-resolution layers to 2x', () => {
    const legacy: MapData = {
      ...testMap,
      areas: [
        ['tree', 'none', 'none', 'none'],
        ['none', 'none', 'none', 'none'],
        ['none', 'none', 'none', 'none'],
      ] as MapData['areas'],
    };
    const g = new Grid(legacy);
    // logical (0,0)=tree expands to bg cells (0,0),(1,0),(0,1),(1,1)
    expect(g.getArea(0, 0)).toBe('tree');
    expect(g.getArea(1, 1)).toBe('tree');
    expect(g.getArea(2, 0)).toBe('none');
    expect(g.canPlaceAtBg(0, 0, 'arrow')).toBe(false);
    expect(g.canPlaceAtBg(2, 0, 'arrow')).toBe(true);
  });

  it('blocks all building on trees and walls', () => {
    expect(grid.canPlaceAtBg(0, 0)).toBe(false);           // generic gate (tree)
    expect(grid.canPlaceAtBg(0, 0, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(0, 0, 'sniper')).toBe(false);
    expect(grid.canPlaceAtBg(2, 0, 'arrow')).toBe(false);  // wall
    expect(grid.canPlaceAtBg(2, 0, 'sniper')).toBe(false);
    expect(grid.placeTowerAtBg(0, 0, 'arrow')).toBe(false);
    expect(grid.placeTowerAtBg(2, 0, 'sniper')).toBe(false);
  });

  it('allows ONLY the sniper on a roof', () => {
    expect(grid.canPlaceAtBg(4, 0, 'sniper')).toBe(true);
    expect(grid.placeTowerAtBg(4, 0, 'sniper')).toBe(true);
    expect(grid.canPlaceAtBg(4, 0, 'sniper')).toBe(false); // now occupied
  });

  it('keeps other towers off roofs', () => {
    expect(grid.canPlaceAtBg(4, 0, 'arrow')).toBe(false);
    expect(grid.canPlaceAtBg(4, 0, 'cannon')).toBe(false);
    expect(grid.canPlaceAtBg(4, 0, 'frost')).toBe(false);
    expect(grid.canPlaceAtBg(4, 0, 'mortar')).toBe(false);
    expect(grid.canPlaceAtBg(4, 0, 'tesla')).toBe(false);
  });

  it('keeps snipers off normal ground', () => {
    expect(grid.canPlaceAtBg(6, 0, 'sniper')).toBe(false);  // plain empty cell
    expect(grid.canPlaceAtBg(6, 4, 'sniper')).toBe(false);  // another empty cell
    expect(grid.placeTowerAtBg(6, 4, 'sniper')).toBe(false);
    // ...but other towers are fine there
    expect(grid.canPlaceAtBg(6, 4, 'arrow')).toBe(true);
  });
});
