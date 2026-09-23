/**
 * Road curve generation utility.
 * Generates smooth curved paths for tower defense maps.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Angle = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Generate a straight line of path points in any direction.
 * direction: 'up'|'down'|'left'|'right'
 * angle: 0-315 degrees (for diagonal movement)
 */
export function straight(
  startX: number,
  startY: number,
  direction: Direction,
  length: number,
  angle: Angle = 0,
): CurvePoint[] {
  const points: CurvePoint[] = [];

  // Calculate dx, dy based on direction and angle
  let dx = 0, dy = 0;
  switch (direction) {
    case 'right': dx = 1; break;
    case 'left': dx = -1; break;
    case 'down': dy = 1; break;
    case 'up': dy = -1; break;
  }

  // Apply angle rotation for diagonal movement
  if (angle !== 0) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const newDx = dx * cos - dy * sin;
    const newDy = dx * sin + dy * cos;
    dx = Math.round(newDx);
    dy = Math.round(newDy);
  }

  for (let i = 0; i < length; i++) {
    points.push({ x: startX + dx * i, y: startY + dy * i });
  }
  return points;
}

/**
 * Generate a diagonal straight line.
 * dx: horizontal step per cell (-1, 0, or 1)
 * dy: vertical step per cell (-1, 0, or 1)
 */
export function diagonal(
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  length: number,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let i = 0; i < length; i++) {
    points.push({ x: startX + dx * i, y: startY + dy * i });
  }
  return points;
}

/**
 * Generate a 90-degree curve (quarter circle).
 * size: radius of the curve in cells (1-6)
 * fromDir: direction coming from
 * toDir: direction going to
 */
export function curve90(
  centerX: number,
  centerY: number,
  fromDir: Direction,
  toDir: Direction,
  size: number = 2,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const segments = size * 4;

  // Determine arc angles based on direction change
  let startAngle = 0;
  let endAngle = Math.PI / 2;

  if (fromDir === 'right' && toDir === 'down') { startAngle = Math.PI; endAngle = Math.PI * 1.5; }
  else if (fromDir === 'right' && toDir === 'up') { startAngle = Math.PI; endAngle = Math.PI * 0.5; }
  else if (fromDir === 'left' && toDir === 'down') { startAngle = 0; endAngle = Math.PI * 0.5; }
  else if (fromDir === 'left' && toDir === 'up') { startAngle = 0; endAngle = -Math.PI * 0.5; }
  else if (fromDir === 'down' && toDir === 'right') { startAngle = Math.PI * 1.5; endAngle = Math.PI * 2; }
  else if (fromDir === 'down' && toDir === 'left') { startAngle = Math.PI * 1.5; endAngle = Math.PI; }
  else if (fromDir === 'up' && toDir === 'right') { startAngle = Math.PI * 0.5; endAngle = 0; }
  else if (fromDir === 'up' && toDir === 'left') { startAngle = Math.PI * 0.5; endAngle = Math.PI; }

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + (endAngle - startAngle) * t;
    const x = Math.round(centerX + Math.cos(angle) * size);
    const y = Math.round(centerY + Math.sin(angle) * size);
    points.push({ x, y });
  }

  return points;
}

/**
 * Generate a 45-degree curve (smoother turn).
 * size: radius of the curve in cells (1-6)
 */
export function curve45(
  startX: number,
  startY: number,
  fromDir: Direction,
  toDir: Direction,
  size: number = 2,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const segments = size * 3;

  let dx = 0, dy = 0;
  if (toDir === 'right') dx = 1;
  else if (toDir === 'left') dx = -1;
  else if (toDir === 'down') dy = 1;
  else if (toDir === 'up') dy = -1;

  // Generate a gentle 45-degree arc
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const curve = Math.sin(t * Math.PI / 2);
    const x = Math.round(startX + dx * size * t + (dy !== 0 ? curve * size * 0.5 * (dx > 0 ? 1 : -1) : 0));
    const y = Math.round(startY + dy * size * t + (dx !== 0 ? curve * size * 0.5 * (dy > 0 ? 1 : -1) : 0));
    points.push({ x, y });
  }

  return points;
}

/**
 * Generate a U-turn (180 degrees).
 * size: width of the U-turn in cells (2-6)
 */
export function uTurn(
  startX: number,
  startY: number,
  fromDir: Direction,
  size: number = 2,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  const segments = size * 6;

  let startAngle = 0;
  if (fromDir === 'right') startAngle = Math.PI;
  else if (fromDir === 'left') startAngle = 0;
  else if (fromDir === 'down') startAngle = Math.PI * 0.5;
  else if (fromDir === 'up') startAngle = Math.PI * 1.5;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + Math.PI * t;
    const x = Math.round(startX + Math.cos(angle) * size);
    const y = Math.round(startY + Math.sin(angle) * size);
    points.push({ x, y });
  }

  return points;
}

/**
 * Combine multiple path segments into a single path.
 * Removes duplicate consecutive points.
 */
export function combinePaths(...paths: CurvePoint[][]): CurvePoint[] {
  const combined: CurvePoint[] = [];
  for (const path of paths) {
    for (const point of path) {
      const last = combined[combined.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        combined.push(point);
      }
    }
  }
  return combined;
}

/**
 * Convert path points to grid coordinates for map definition.
 */
export function toGridPath(points: CurvePoint[]): string {
  return points.map(p => `{ x: ${p.x}, y: ${p.y} }`).join(', ');
}
