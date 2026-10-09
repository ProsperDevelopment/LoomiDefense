// ============================================================
// Minimap preview renderer for the level selector — draws a
// small top-down view of a MapData into a <canvas>: ground
// checkerboard, road polylines, blocked cells, spawn/base dots.
// ============================================================
import type { MapData } from '../types';

function toCss(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

/** Draw `map` into `canvas` (sized by CSS; scaled for devicePixelRatio). */
export function drawLevelPreview(canvas: HTMLCanvasElement, map: MapData): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 250;
  const cssH = canvas.clientHeight || 188;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cols = map.width;
  const rows = map.height;
  if (cols <= 0 || rows <= 0) return;
  const cell = Math.min(cssW / cols, cssH / rows);
  const ox = (cssW - cell * cols) / 2;
  const oy = (cssH - cell * rows) / 2;

  // Ground checkerboard — same defaults as MapRenderer
  const light = toCss(map.groundColor ?? 0x8a8c4e);
  const dark = toCss(map.groundColorDark ?? 0x9a9c5e);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? dark : light;
      ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
    }
  }

  // Blocked (no-build) cells as dark overlay
  if (map.grid) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (let r = 0; r < Math.min(rows, map.grid.length); r++) {
      const row = map.grid[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(cols, row.length); c++) {
        if (row[c] === 'blocked') {
          ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
        }
      }
    }
  }

  // Road: main path + branches, stroked through cell centres
  const cx = (p: { x: number; y: number }): number => ox + (p.x + 0.5) * cell;
  const cy = (p: { x: number; y: number }): number => oy + (p.y + 0.5) * cell;
  ctx.strokeStyle = toCss(map.roadColor ?? 0x7a7a7a);
  ctx.lineWidth = Math.max(2, cell);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const strokePoly = (pts: { x: number; y: number }[]): void => {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(cx(pts[0]), cy(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(cx(pts[i]), cy(pts[i]));
    if (pts.length === 1) ctx.lineTo(cx(pts[0]) + 0.01, cy(pts[0]));
    ctx.stroke();
  };
  strokePoly(map.basePath ?? []);
  for (const br of map.branches ?? []) strokePoly(br);

  // Spawn (green) and base (red) markers, with the game's fallbacks
  const spawns = map.spawnPoints?.length
    ? map.spawnPoints
    : map.basePath?.length ? [map.basePath[0]] : [];
  const bases = map.basePoints?.length
    ? map.basePoints
    : map.basePath?.length ? [map.basePath[map.basePath.length - 1]] : [];

  const dot = (p: { x: number; y: number }, color: string): void => {
    ctx.beginPath();
    ctx.arc(cx(p), cy(p), Math.max(2, cell * 0.3), 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  };
  for (const p of spawns) dot(p, '#4CAF50');
  for (const p of bases) dot(p, '#e74c3c');
}
