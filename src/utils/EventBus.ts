import type { GameEvent, EventPayload } from '../types';

type Handler<K extends GameEvent> = (payload: EventPayload[K]) => void;

/**
 * Decoupled event bus for cross-system communication.
 * Uses a simple pub/sub pattern with type-safe events.
 */
export class EventBus {
  private handlers = new Map<GameEvent, Set<Handler<any>>>();

  on<K extends GameEvent>(event: K, handler: Handler<K>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  off<K extends GameEvent>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends GameEvent>(event: K, payload: EventPayload[K]): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();
