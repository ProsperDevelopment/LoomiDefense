/**
 * Generic object pool to avoid runtime allocations.
 * Pre-allocates objects and recycles them.
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private initialSize: number;

  constructor(factory: () => T, resetFn: (obj: T) => void, initialSize: number = 20) {
    this.factory = factory;
    this.reset = resetFn;
    this.initialSize = initialSize;
    this.prewarm();
  }

  private prewarm(): void {
    for (let i = 0; i < this.initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  acquire(): T {
    const obj = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.active.delete(obj)) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  releaseAll(): void {
    for (const obj of this.active) {
      this.reset(obj);
      this.pool.push(obj);
    }
    this.active.clear();
  }

  getActiveCount(): number {
    return this.active.size;
  }

  getActive(): Set<T> {
    return this.active;
  }

  getTotalSize(): number {
    return this.pool.length + this.active.size;
  }
}
