import type { CellType, MapData, AreaType, TowerType } from '../types';
import { CELL_SIZE, GRID_OFFSET_Y } from '../config/constants';

/** Background-tile cell size (half of a logical grid cell). */
const BG_CELL = CELL_SIZE / 2;

function sanitizeArea(v: unknown): AreaType {
  return v === 'tree' || v === 'wall' || v === 'roof' ? v : 'none';
}

/**
 * Grid-based map system.
 *
 * Two coordinate spaces:
 *  - logical grid (cols x rows): path / spawn / base cells
 *  - background grid (2x cols x 2x rows): tiles, areas and TOWERS —
 *    towers can be positioned on any background-grid cell
 *
 * Placement rules (area layer, background-grid resolution):
 *  - tree / wall: no towers at all
 *  - roof: only the sniper tower; snipers may ONLY be built on roofs
 *  - never on path / spawn / base (logical cell must be empty)
 *  - no overlapping towers (48px sprites on a 24px grid = no other tower
 *    within Chebyshev distance 1)
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  private cells: CellType[][];
  /** Area overlay at background-grid resolution (2x cols x 2x rows). */
  private areas: AreaType[][];
  /** Occupied background cells: "col,row" of every placed tower. */
  private bgOccupied = new Set<string>();
  private mapData: MapData;

  constructor(mapData: MapData) {
    this.mapData = mapData;
    this.cols = mapData.width;
    this.rows = mapData.height;
    this.cellSize = mapData.cellSize;
    this.cells = mapData.grid.map(row => [...row]);
    this.areas = Grid.normalizeAreas(mapData.areas, this.cols, this.rows);
  }

  /**
   * Normalize the area layer to background-grid resolution:
   *  - background-resolution layers (2x) are sanitized as-is
   *  - legacy grid-resolution layers are expanded cell -> 2x2 block
   *  - anything else becomes an empty layer
   */
  private static normalizeAreas(
    raw: AreaType[][] | undefined,
    cols: number,
    rows: number,
  ): AreaType[][] {
    const empty = () =>
      Array.from({ length: rows * 2 }, () => new Array<AreaType>(cols * 2).fill('none'));
    if (!Array.isArray(raw) || raw.length === 0) return empty();

    const width = Array.isArray(raw[0]) ? raw[0].length : 0;
    // Already background-grid resolution (same as bgTiles)
    if (raw.length === rows * 2 && width === cols * 2) {
      return raw.map(row => row.map(sanitizeArea));
    }
    // Legacy grid resolution: expand each cell into a 2x2 block
    if (raw.length === rows && width === cols) {
      const out: AreaType[][] = [];
      for (const row of raw) {
        const bgRow = (row as unknown[]).flatMap(v => {
          const a = sanitizeArea(v);
          return [a, a];
        });
        out.push([...bgRow], [...bgRow]);
      }
      return out;
    }
    return empty();
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

  /** Area type of a background-grid cell ('none' when out of bounds or unset). */
  getArea(bgCol: number, bgRow: number): AreaType {
    if (bgCol < 0 || bgCol >= this.cols * 2 || bgRow < 0 || bgRow >= this.rows * 2) {
      return 'none';
    }
    return this.areas[bgRow]?.[bgCol] ?? 'none';
  }

  /**
   * Can `towerType` be built on this background-grid cell?
   * Without a type only the area/collision gates apply (used to decide
   * whether ANY loadout tower could go here).
   */
  canPlaceAtBg(bgCol: number, bgRow: number, towerType?: TowerType): boolean {
    // Background-grid bounds
    if (bgCol < 0 || bgCol >= this.cols * 2 || bgRow < 0 || bgRow >= this.rows * 2) {
      return false;
    }
    // Never on path / spawn / base (their logical cell must be empty)
    if (this.getCell(Math.floor(bgCol / 2), Math.floor(bgRow / 2)) !== 'empty') {
      return false;
    }
    // Area rules: walls and trees block everything; roofs are sniper-only
    const area = this.getArea(bgCol, bgRow);
    if (area === 'wall' || area === 'tree') return false;
    if (towerType !== undefined) {
      if (towerType === 'sniper') {
        if (area !== 'roof') return false;
      } else if (area === 'roof') {
        return false;
      }
    }
    // Tower collision: sprites are 48px on a 24px grid — no overlap means
    // no other tower within Chebyshev distance 1 (same or adjacent cell)
    if (this.hasTowerAtBg(bgCol, bgRow)) return false;
    return true;
  }

  /**
   * Is a tower's 48px sprite covering this background cell?
   * (A tower centered on a cell overhangs into its 8 neighbours — the same
   * Chebyshev-1 footprint used for placement collision.)
   */
  hasTowerAtBg(bgCol: number, bgRow: number): boolean {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (this.bgOccupied.has(`${bgCol + dc},${bgRow + dr}`)) return true;
      }
    }
    return false;
  }

  /**
   * Is this world point within `radius` pixels of a tower's center?
   * Used for blood drips — deliberately narrower than the full collision
   * footprint so splatter only runs down towers it actually lands on.
   */
  nearTower(x: number, y: number, radius: number = 16): boolean {
    const col = Math.floor(x / BG_CELL);
    const row = Math.floor((y - GRID_OFFSET_Y) / BG_CELL);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!this.bgOccupied.has(`${col + dc},${row + dr}`)) continue;
        const cx = (col + dc) * BG_CELL + BG_CELL / 2;
        const cy = (row + dr) * BG_CELL + BG_CELL / 2 + GRID_OFFSET_Y;
        if (Math.hypot(x - cx, y - cy) <= radius) return true;
      }
    }
    return false;
  }

  /**
   * World Y of the bottom edge of the wall/tree column this point lands on
   * — where a blood drip running down the object ends. Null when the point
   * isn't on a wall/tree (out-of-bounds counts as 'none').
   */
  areaBottomY(x: number, y: number): number | null {
    const { col, row } = this.worldToBgGrid(x, y);
    const solid = (r: number): boolean => {
      const area = this.getArea(col, r);
      return area === 'wall' || area === 'tree';
    };
    if (!solid(row)) return null;
    // Follow the column down while it stays solid — the object ends at
    // the first gap (or the bottom of the map)
    let last = row;
    for (let r = row + 1; r < this.rows * 2 && solid(r); r++) last = r;
    return GRID_OFFSET_Y + (last + 1) * BG_CELL;
  }

  /**
   * World Y of the bottom edge of the nearest tower this point lands on —
   * same narrow center radius as nearTower() so splatter only runs down
   * towers it actually hit. Null when there's no tower here.
   */
  towerBottomY(x: number, y: number): number | null {
    const col = Math.floor(x / BG_CELL);
    const row = Math.floor((y - GRID_OFFSET_Y) / BG_CELL);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!this.bgOccupied.has(`${col + dc},${row + dr}`)) continue;
        const cx = (col + dc) * BG_CELL + BG_CELL / 2;
        const cy = (row + dr) * BG_CELL + BG_CELL / 2 + GRID_OFFSET_Y;
        if (Math.hypot(x - cx, y - cy) <= 16) return cy + CELL_SIZE / 2;
      }
    }
    return null;
  }


  /**
   * Tower whose body covers this point (within `radius` of its center)
   * as its center — debris uses this to glide off towers it lands on.
   */
  towerNear(x: number, y: number, radius: number): { cx: number; cy: number } | null {
    const col = Math.floor(x / BG_CELL);
    const row = Math.floor((y - GRID_OFFSET_Y) / BG_CELL);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!this.bgOccupied.has(`${col + dc},${row + dr}`)) continue;
        const cx = (col + dc) * BG_CELL + BG_CELL / 2;
        const cy = (row + dr) * BG_CELL + BG_CELL / 2 + GRID_OFFSET_Y;
        if (Math.hypot(x - cx, y - cy) <= radius) return { cx, cy };
      }
    }
    return null;
  }

  placeTowerAtBg(bgCol: number, bgRow: number, towerType?: TowerType): boolean {
    if (!this.canPlaceAtBg(bgCol, bgRow, towerType)) return false;
    this.bgOccupied.add(`${bgCol},${bgRow}`);
    return true;
  }

  removeTowerAtBg(bgCol: number, bgRow: number): void {
    this.bgOccupied.delete(`${bgCol},${bgRow}`);
  }

  /** Logical grid cell -> world pixels (path/spawn markers). */
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

  /** Background-grid cell -> world pixels (towers, hover, areas). */
  bgToWorld(bgCol: number, bgRow: number): { x: number; y: number } {
    return {
      x: bgCol * BG_CELL + BG_CELL / 2,
      y: bgRow * BG_CELL + BG_CELL / 2 + GRID_OFFSET_Y,
    };
  }

  worldToBgGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor(x / BG_CELL),
      row: Math.floor((y - GRID_OFFSET_Y) / BG_CELL),
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
    this.areas = Grid.normalizeAreas(this.mapData.areas, this.cols, this.rows);
    this.bgOccupied.clear();
  }
}
