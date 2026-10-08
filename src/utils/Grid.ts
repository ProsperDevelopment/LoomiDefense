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

  /** Authored bases, falling back to the main path's end. */
  getBasePoints(): { x: number; y: number }[] {
    const bases = this.mapData.basePoints;
    if (bases && bases.length > 0) return bases;
    const end = this.mapData.basePath[this.mapData.basePath.length - 1];
    return end ? [end] : [];
  }

  /**
   * Reverse route for ninja summons, returned in spawn->base order so
   * Enemy's reverse walker departs from the chosen base. Walks the
   * graph out of the base taking the first (lowest edge-order) option
   * at every fork — for branches that heads back toward the spawn.
   * Branchless levels slice the linear path, so legacy levels behave
   * exactly as before.
   */
  resolveBaseRoutePixels(baseIndex: number): { x: number; y: number }[] {
    const bases = this.getBasePoints();
    if (bases.length === 0 || this.mapData.basePath.length === 0) return this.getPathPixels();
    const idx = Math.max(0, Math.min(Math.floor(baseIndex) || 0, bases.length - 1));
    const base = bases[idx];
    const mainEnd = this.mapData.basePath[this.mapData.basePath.length - 1];

    if (!this.mapData.branches || this.mapData.branches.length === 0) {
      // Single road: the main end keeps the exact legacy route
      if (base.x === mainEnd.x && base.y === mainEnd.y) return this.getPathPixels();
      let i = this.mapData.basePath.findIndex((p) => p.x === base.x && p.y === base.y);
      if (i < 0) {
        // Base cell often sits next to the road — use its neighbour
        i = this.mapData.basePath.findIndex(
          (p) => Math.abs(p.x - base.x) <= 1 && Math.abs(p.y - base.y) <= 1,
        );
      }
      if (i < 0) return this.getPathPixels();
      let route = this.mapData.basePath.slice(0, i + 1);
      // End AT the base hole when it sits next to the road
      const last = route[route.length - 1];
      if (last && !(base.x === last.x && base.y === last.y) &&
          Math.abs(base.x - last.x) <= 1 && Math.abs(base.y - last.y) <= 1) {
        route = [...route, base];
      }
      return route.map((p) => this.gridToWorld(p.x, p.y));
    }

    const g = (this.routeGraph ??= this.buildRouteGraph());
    let start = base;
    if (!g.has(Grid.nodeKey(start))) {
      const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      for (const [dx, dy] of offsets) {
        const cand = { x: start.x + dx, y: start.y + dy };
        if (g.has(Grid.nodeKey(cand))) { start = cand; break; }
      }
    }
    if (!g.has(Grid.nodeKey(start))) return this.getPathPixels();
    // Walk base -> dead end, flip so the route ends at the base, then
    // finish AT the base hole itself when it sits next to the road
    const route = this.walkGraph(start, undefined, false).reverse();
    const last = route[route.length - 1];
    if (last && !(base.x === last.x && base.y === last.y) &&
        Math.abs(base.x - last.x) <= 1 && Math.abs(base.y - last.y) <= 1) {
      route.push(base);
    }
    return route.map((p) => this.gridToWorld(p.x, p.y));
  }

  /** All road polylines in world pixels: main path + every branch. */
  getRoadPolylines(): { x: number; y: number }[][] {
    const gridPolys: { x: number; y: number }[][] = [
      this.mapData.basePath,
      ...(this.mapData.branches ?? []).filter((b) => b.length >= 2),
    ];
    const spawns = this.mapData.spawnPoints?.length
      ? this.mapData.spawnPoints
      : this.mapData.basePath.slice(0, 1);
    const bases = this.getBasePoints();
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
    const same = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      a.x === b.x && a.y === b.y;

    const onAnyRoad = (pt: { x: number; y: number }) =>
      gridPolys.some((gp) => gp.some((p) => same(p, pt)));

    const out: { x: number; y: number }[][] = [];
    for (const gp of gridPolys) {
      if (gp.length === 0) continue;
      let pts = [...gp];
      // Stretch the road out to its spawn hole (unless that point is
      // already part of another road — no duplicate segments)...
      const spawn = spawns.find((sp) => near(sp, pts[0]) && !onAnyRoad(sp));
      if (spawn && !same(spawn, pts[0])) pts = [spawn, ...pts];
      // ...and into its base hole
      const last = pts[pts.length - 1];
      const base = bases.find((bp) => near(bp, last) && !onAnyRoad(bp));
      if (base && !same(base, last)) pts = [...pts, base];
      out.push(pts.map((p) => this.gridToWorld(p.x, p.y)));
    }
    return out;
  }

  /** Adjacency for route walking: node key -> edges with creation order. */
  private routeGraph: Map<string, { x: number; y: number; order: number }[]> | null = null;

  private static nodeKey(p: { x: number; y: number }): string {
    return `${p.x},${p.y}`;
  }

  private buildRouteGraph(): Map<string, { x: number; y: number; order: number }[]> {
    const g = new Map<string, { x: number; y: number; order: number }[]>();
    const link = (a: { x: number; y: number }, b: { x: number; y: number }, order: number): void => {
      const ka = Grid.nodeKey(a);
      const kb = Grid.nodeKey(b);
      if (!g.has(ka)) g.set(ka, []);
      if (!g.has(kb)) g.set(kb, []);
      g.get(ka)!.push({ ...b, order });
      g.get(kb)!.push({ ...a, order });
    };
    let order = 0;
    const chain = (pts: { x: number; y: number }[]): void => {
      for (let i = 1; i < pts.length; i++) link(pts[i - 1], pts[i], order++);
    };
    chain(this.mapData.basePath);
    for (const branch of this.mapData.branches ?? []) chain(branch);
    return g;
  }

  /**
   * Full spawn->base route for one enemy: walk the path graph from a
   * spawn point, taking turns[i] at the i-th split (options sorted in
   * edge-creation order: main path first, then branches as authored).
   * Missing or out-of-range turns randomize per call; spawn cells that
   * sit next to the road snap onto it, and an unusable spawn falls back
   * to the main path (legacy behaviour).
   */
  resolveRoutePixels(spawnIndex: number, turns?: number[]): { x: number; y: number }[] {
    const g = (this.routeGraph ??= this.buildRouteGraph());
    const spawnCell = this.mapData.spawnPoints[spawnIndex];
    let start = spawnCell;
    if (start && !g.has(Grid.nodeKey(start))) {
      // Spawn cells often sit adjacent to the road — snap onto it
      const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      for (const [dx, dy] of offsets) {
        const cand = { x: start.x + dx, y: start.y + dy };
        if (g.has(Grid.nodeKey(cand))) { start = cand; break; }
      }
    }
    if (!start || !g.has(Grid.nodeKey(start))) return this.getPathPixels();

    // Start the unit AT the spawn hole itself — the enemy appears at
    // the editor-placed spawn cell, then walks toward the road
    const withHole = (route: { x: number; y: number }[]): { x: number; y: number }[] => {
      if (
        spawnCell &&
        route.length > 0 &&
        !(spawnCell.x === route[0].x && spawnCell.y === route[0].y)
      ) {
        return [spawnCell, ...route];
      }
      return route;
    };

    // Single road (no splits): slice the LINEAR path from the resolved
    // spawn — self-crossing legacy levels contain duplicate nodes that
    // only the linear array walks exactly as authored
    if (!this.mapData.branches || this.mapData.branches.length === 0) {
      const idx = this.mapData.basePath.findIndex(
        (p) => p.x === start!.x && p.y === start!.y,
      );
      if (idx >= 0) return withHole(this.mapData.basePath.slice(idx)).map((p) => this.gridToWorld(p.x, p.y));
      // Spawn cell not on basePath (e.g. adjacent hole): find the
      // nearest road node and slice from there
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < this.mapData.basePath.length; i++) {
        const d = Math.abs(this.mapData.basePath[i].x - start!.x)
                + Math.abs(this.mapData.basePath[i].y - start!.y);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      return withHole(this.mapData.basePath.slice(bestIdx)).map((p) => this.gridToWorld(p.x, p.y));
    }

    return withHole(this.walkGraph(start, turns, true)).map((p) => this.gridToWorld(p.x, p.y));
  }

  /**
   * Graph walk from a node: follow unvisited edges in creation order,
   * consuming turns[i] at the i-th split (randomizing missing turns
   * when randomizeMissing is on, otherwise taking the first option).
   */
  private walkGraph(
    start: { x: number; y: number },
    turns?: number[],
    randomizeMissing: boolean = true,
  ): { x: number; y: number }[] {
    const g = (this.routeGraph ??= this.buildRouteGraph());
    const route: { x: number; y: number }[] = [start];
    const visited = new Set<string>([Grid.nodeKey(start)]);
    let turnIdx = 0;
    let cur = start;
    for (;;) {
      const options = (g.get(Grid.nodeKey(cur)) ?? [])
        .filter((o) => !visited.has(Grid.nodeKey(o)))
        .sort((a, b) => a.order - b.order);
      if (options.length === 0) break; // dead end = a base
      let pick = 0;
      if (options.length > 1) {
        const t = turns?.[turnIdx];
        turnIdx++;
        pick = Number.isInteger(t) && (t as number) >= 0 && (t as number) < options.length
          ? (t as number)
          : randomizeMissing
            ? Math.floor(Math.random() * options.length)
            : 0;
      }
      const next = options[pick];
      route.push(next);
      visited.add(Grid.nodeKey(next));
      cur = next;
    }
    return route;
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
