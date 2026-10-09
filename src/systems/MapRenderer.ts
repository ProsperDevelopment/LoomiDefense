import Phaser from 'phaser';
import type { Grid } from '../utils/Grid';
import type { MapData } from '../types';
import { CELL_SIZE, GRID_OFFSET_Y } from '../config/constants';
import { collectBgTileLoads, bgTileKey } from '../utils/backgroundTiles';

// ── Host interface ───────────────────────────────────────────

export interface MapRendererHost {
  grid: Grid;
  add: Phaser.GameObjects.GameObjectFactory;
  textures: Phaser.Textures.TextureManager;
  load: Phaser.Loader.LoaderPlugin;
  children: Phaser.GameObjects.DisplayList;
}

// ── System ───────────────────────────────────────────────────

export class MapRenderer {
  private bgTileEpoch = 0;
  private bgTileLoadActive = false;
  private bgTilesAttempted = new Set<string>();

  constructor(private s: MapRendererHost & Phaser.Scene) {}

  /** Reset per-level tile loading state (call on scene restart). */
  reset(): void {
    this.bgTileEpoch++;
    this.bgTileLoadActive = false;
    this.bgTilesAttempted.clear();
  }

  // ── Orchestrator ─────────────────────────────────────────

  drawGrid(): void {
    const mapData = this.s.grid.getMapData();

    const groundLight = mapData.groundColor ?? 0x8a8c4e;
    const groundDark = mapData.groundColorDark ?? 0x9a9c5e;
    for (let row = 0; row < this.s.grid.rows; row++) {
      for (let col = 0; col < this.s.grid.cols; col++) {
        const x = col * CELL_SIZE;
        const y = row * CELL_SIZE + GRID_OFFSET_Y;
        const isDark = (row + col) % 2 === 0;
        this.s.add.rectangle(
          x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE, CELL_SIZE,
          isDark ? groundDark : groundLight,
        );
      }
    }

    this.drawSmoothRoad(mapData.roadColor, mapData.roadColorDark);
    this.drawBackgroundTiles(mapData);
    this.drawSpawnBaseHoles();
  }

  // ── Spawn/base holes ─────────────────────────────────────

  drawSpawnBaseHoles(): void {
    const w = this.s.grid.cellSize * 1.15;
    const yOff = -this.s.grid.cellSize * 0.2;
    const src = this.s.textures.get('hole_background').getSourceImage() as { width: number; height: number };
    const h = src.width > 0 ? (w * src.height) / src.width : (w * 21) / 32;

    const map = this.s.grid.getMapData();
    const spawns = map.spawnPoints?.length
      ? map.spawnPoints
      : map.basePath.length > 0
        ? [map.basePath[0]]
        : [];
    const bases = this.s.grid.getBasePoints();

    const polylines = this.s.grid.getRoadPolylines().filter((pl) => pl.length >= 2);
    const dirFor = (gx: number, gy: number): boolean => {
      for (const pl of polylines) {
        const g0 = this.s.grid.worldToGrid(pl[0].x, pl[0].y);
        if (g0.col === gx && g0.row === gy) return (pl[0].y - pl[1].y) < 0;
        const gN = this.s.grid.worldToGrid(pl[pl.length - 1].x, pl[pl.length - 1].y);
        if (gN.col === gx && gN.row === gy) return (pl[pl.length - 1].y - pl[pl.length - 2].y) < 0;
      }
      return false;
    };

    const seen = new Set<string>();
    const place = (pts: { x: number; y: number }[], bgKey: string, fgKey: string): void => {
      for (const p of pts) {
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { x, y } = this.s.grid.gridToWorld(p.x, p.y);
        const fromAbove = dirFor(p.x, p.y);
        const bgDepth = fromAbove ? 4 : 9;
        const fgDepth = fromAbove ? 5 : 12;
        this.s.add.image(x, y - yOff, bgKey).setDisplaySize(w, h).setDepth(bgDepth);
        this.s.add.image(x, y - yOff, fgKey).setDisplaySize(w, h).setDepth(fgDepth);
      }
    };
    place(spawns, 'spawn_hole_bg', 'spawn_hole_fg');
    place(bases, 'base_hole_bg', 'base_hole_fg');
  }

  // ── Background tiles (async on-demand loading) ───────────

  drawBackgroundTiles(mapData: MapData): void {
    if (!mapData.bgTiles || mapData.bgTiles.length === 0) return;

    const loads = collectBgTileLoads(mapData.bgTiles);
    const pending = loads.filter(
      (l) => !this.s.textures.exists(l.key) && !this.bgTilesAttempted.has(l.key),
    );

    if (pending.length > 0) {
      if (this.bgTileLoadActive) return;
      this.bgTileLoadActive = true;
      const epoch = this.bgTileEpoch;
      this.s.load.once('complete', () => {
        if (epoch !== this.bgTileEpoch) return;
        this.bgTileLoadActive = false;
        this.drawBackgroundTiles(mapData);
      });
      for (const { key, url } of pending) {
        this.bgTilesAttempted.add(key);
        this.s.load.image(key, url);
      }
      this.s.load.start();
      return;
    }

    const bgCellSize = CELL_SIZE / 2;
    for (let row = 0; row < mapData.bgTiles.length; row++) {
      for (let col = 0; col < mapData.bgTiles[row].length; col++) {
        const tileIdx = mapData.bgTiles[row][col];
        if (tileIdx < 0) continue;
        const tileKey = bgTileKey(tileIdx);
        if (tileKey && this.s.textures.exists(tileKey)) {
          const isFg = mapData.fgAreas?.[row]?.[col] === 'fg';
          this.s.add.image(col * bgCellSize + bgCellSize / 2, row * bgCellSize + GRID_OFFSET_Y + bgCellSize / 2, tileKey)
            .setDisplaySize(bgCellSize, bgCellSize)
            .setDepth(isFg ? 20 : 10);
        }
      }
    }
  }

  // ── Road rendering ───────────────────────────────────────

  drawSmoothRoad(roadColor?: number, roadColorDark?: number): void {
    const polylines = this.s.grid.getRoadPolylines().filter((p) => p.length >= 2);
    if (polylines.length === 0) return;

    const graphics = this.s.add.graphics();
    const fill = roadColor ?? 0x7a7a7a;
    const outline = roadColorDark ?? MapRenderer.shadeColor(fill, 0.6);
    const center = MapRenderer.shadeColor(fill, 1.3);

    for (const smoothPoints of polylines) {
      graphics.lineStyle(36, outline, 1);
      MapRenderer.drawSmoothPath(graphics, smoothPoints);
    }
    for (const smoothPoints of polylines) {
      MapRenderer.drawSmoothPathCap(graphics, smoothPoints, 18, outline);
    }
    for (const smoothPoints of polylines) {
      graphics.lineStyle(28, fill, 1);
      MapRenderer.drawSmoothPath(graphics, smoothPoints);
    }
    for (const smoothPoints of polylines) {
      MapRenderer.drawSmoothPathCap(graphics, smoothPoints, 14, fill);
    }
    for (const smoothPoints of polylines) {
      graphics.lineStyle(2, center, 0.5);
      MapRenderer.drawSmoothPath(graphics, smoothPoints);
    }
  }

  static drawSmoothPathCap(
    graphics: Phaser.GameObjects.Graphics,
    points: { x: number; y: number }[],
    radius: number,
    color: number,
  ): void {
    if (points.length < 2) return;
    const capAt = (endIdx: number, towardIdx: number): void => {
      const e = points[endIdx];
      const t = points[towardIdx];
      const dx = t.x - e.x;
      const dy = t.y - e.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.01) return;
      const outAngle = Math.atan2(-dy, -dx);
      graphics.fillStyle(color, 1);
      graphics.beginPath();
      graphics.arc(e.x, e.y, radius, outAngle - Math.PI / 2, outAngle + Math.PI / 2, false);
      graphics.closePath();
      graphics.fillPath();
    };
    capAt(points.length - 1, points.length - 2);
    capAt(0, 1);
  }

  static drawSmoothPath(graphics: Phaser.GameObjects.Graphics, points: { x: number; y: number }[]): void {
    if (points.length < 2) return;

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[Math.min(points.length - 1, i + 1)];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const segments = 8;
      for (let t = 1; t <= segments; t++) {
        const tt = t / segments;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        const x = 0.5 * (
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3 +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + p2.x) * tt +
          2 * p1.x
        );
        const y = 0.5 * (
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3 +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + p2.y) * tt +
          2 * p1.y
        );
        graphics.lineTo(x, y);
      }
    }

    graphics.strokePath();
  }

  static shadeColor(color: number, factor: number): number {
    const r = Math.min(255, Math.round(((color >> 16) & 0xFF) * factor));
    const g = Math.min(255, Math.round(((color >> 8) & 0xFF) * factor));
    const b = Math.min(255, Math.round((color & 0xFF) * factor));
    return (r << 16) | (g << 8) | b;
  }

  // ── Grid blocking ────────────────────────────────────────

  blockSmoothRoadCells(): void {
    for (const pathPixels of this.s.grid.getRoadPolylines()) {
      this.blockPolylineCells(pathPixels);
    }
  }

  blockPolylineCells(pathPixels: { x: number; y: number }[]): void {
    if (pathPixels.length < 2) return;

    const cellSize = this.s.grid.cellSize;
    const roadWidth = cellSize * 0.4;

    for (let i = 0; i < pathPixels.length - 1; i++) {
      const p0 = pathPixels[Math.max(0, i - 1)];
      const p1 = pathPixels[i];
      const p2 = pathPixels[Math.min(pathPixels.length - 1, i + 1)];
      const p3 = pathPixels[Math.min(pathPixels.length - 1, i + 2)];

      const segments = 4;
      for (let t = 0; t <= segments; t++) {
        const tt = t / segments;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;

        const x = 0.5 * (
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tt3 +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt2 +
          (-p0.x + p2.x) * tt +
          2 * p1.x
        );
        const y = 0.5 * (
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tt3 +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt2 +
          (-p0.y + p2.y) * tt +
          2 * p1.y
        );

        const { col, row } = this.s.grid.worldToGrid(x, y);
        if (col >= 0 && col < this.s.grid.cols && row >= 0 && row < this.s.grid.rows) {
          const cellType = this.s.grid.getCell(col, row);
          if (cellType === 'empty') {
            this.s.grid.setCell(col, row, 'path');
          }
        }
      }
    }
  }

  /** Re-depth background tiles that overlap the top half of a tower. */
  tuckTopTilesUnderTower(tower: { position: { x: number; y: number }; getGridCol(): number; getGridRow(): number }): void {
    const topY = tower.position.y - CELL_SIZE * 0.25;
    for (const child of this.s.children.list) {
      if (!(child instanceof Phaser.GameObjects.Image)) continue;
      if (child.depth !== 10 && child.depth !== 20) continue;
      const dx = Math.abs(child.x - tower.position.x);
      const dy = child.y - tower.position.y;
      if (dx < CELL_SIZE * 0.75 && dy < 0 && dy > -CELL_SIZE * 1.2) {
        child.setDepth(2);
      }
    }
  }
}
