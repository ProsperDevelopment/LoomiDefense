/**
 * Position component - tracks world position and velocity.
 */
export class Position {
  x: number;
  y: number;
  velocityX: number = 0;
  velocityY: number = 0;

  constructor(x: number = 0, y: number = 0) {
    this.x = x;
    this.y = y;
  }

  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  distanceTo(other: Position): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  angleTo(other: Position): number {
    return Math.atan2(other.y - this.y, other.x - this.x);
  }

  moveToward(targetX: number, targetY: number, speed: number, deltaSec: number): boolean {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < speed * deltaSec) {
      this.x = targetX;
      this.y = targetY;
      return true; // reached
    }

    const nx = dx / dist;
    const ny = dy / dist;
    this.x += nx * speed * deltaSec;
    this.y += ny * speed * deltaSec;
    return false;
  }

  reset(x: number = 0, y: number = 0): void {
    this.x = x;
    this.y = y;
    this.velocityX = 0;
    this.velocityY = 0;
  }
}
