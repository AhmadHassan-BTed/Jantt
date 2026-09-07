import type { Person, Team, JanttData } from "@jantt/core";

export interface PlaygroundEventMap {
  PEOPLE_CHANGED: Person[];
  TEAMS_CHANGED: Team[];
  FLUSH_SAVE: void;
  SHOW_TOAST: { message: string; isError?: boolean };
  SNAPSHOT_RESTORED: { data: JanttData; reason: string };
  PLAN_RESET: void;
}

export type EventKey = keyof PlaygroundEventMap;

/**
 * Lightweight, type-safe Command and Event Bus.
 * Decouples cross-hook synchronization and eliminates mutable circular useRef gymnastics.
 */
export class CommandBus {
  private handlers = new Map<EventKey, Set<(payload: any) => void>>();

  /**
   * Subscribes a listener to a specific event.
   *
   * @param event - The event identifier.
   * @param handler - Callback function invoked on event emission.
   * @returns Unsubscribe function to clean up listener.
   */
  public on<K extends EventKey>(
    event: K,
    handler: (payload: PlaygroundEventMap[K]) => void
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const set = this.handlers.get(event)!;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Emits an event to all active subscribers.
   */
  public emit<K extends EventKey>(event: K, payload: PlaygroundEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;

    // Create shallow clone of set to prevent mutation during iteration
    [...set].forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`Error in CommandBus handler for event "${event}":`, err);
      }
    });
  }

  /**
   * Clears all registered handlers (useful for test isolation).
   */
  public clear(): void {
    this.handlers.clear();
  }
}

/**
 * Application-wide singleton command bus instance.
 */
export const commandBus = new CommandBus();
