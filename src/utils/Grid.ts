import type { CellType, MapData } from '../types';
import { CELL_SIZE, GRID_OFFSET_Y } from '../config/constants';

/**
 * Grid-based map system.
 * Manages cell states, validates placement, and provides world<->grid conversions.
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  private cells: CellType[][];
  private mapData: MapData;

  constructor(mapData: MapData) {
    this.mapData = mapData;
    this.cols = mapData.width;
    this.rows = mapData.height;
    this.cellSize = mapData.cellSize;
    this.cells = mapData.grid.map(row => [...row]);
  }

  getCell(col: number, row: number): CellType {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return 'blocked';
    }
    return this.cells[row][col];
  }

  setCell(col: number, row: number, type: CellType): void {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this.cells[row][col] = type;
    }
  }

  canPlace(col: number, row: number): boolean {
    return this.getCell(col, row) === 'empty';
  }

  placeTower(col: number, row: number): boolean {
    if (this.canPlace(col, row)) {
      this.cells[row][col] = 'tower';
      return true;
    }
    return false;
  }

  removeTower(col: number, row: number): void {
    if (this.getCell(col, row) === 'tower') {
      this.cells[row][col] = 'empty';
    }
  }

  gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2 + GRID_OFFSET_Y,
    };
  }

  worldToGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor(x / this.cellSize),
      row: Math.floor((y - GRID_OFFSET_Y) / this.cellSize),
    };
  }

  getSpawnPixels(): { x: number; y: number }[] {
    return this.mapData.spawnPoints.map(p => this.gridToWorld(p.x, p.y));
  }

  getPathPixels(): { x: number; y: number }[] {
    return this.mapData.basePath.map(p => this.gridToWorld(p.x, p.y));
  }

  getMapData(): MapData {
    return this.mapData;
  }

  reset(): void {
    this.cells = this.mapData.grid.map(row => [...row]);
  }
}
