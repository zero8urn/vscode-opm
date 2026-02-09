/**
 * Typed event bus for decoupled component communication.
 * Uses Observer pattern with type-safe event emission/subscription.
 *
 * @example
 * ```typescript
 * const bus = new EventBus();
 *
 * // Subscribe to events
 * const sub = bus.on('projects:changed', (data) => {
 *   console.log('Projects changed:', data.projectPaths);
 * });
 *
 * // Emit events
 * bus.emit('projects:changed', { projectPaths: ['a.csproj', 'b.csproj'] });
 *
 * // Cleanup
 * sub.dispose();
 * ```
 */

import type { Disposable } from './types';

/**
 * Map of event names to their payload types.
 * Extend this interface to add new event types.
 */
export interface EventMap {
  'projects:changed': { projectPaths: string[] };
  'cache:invalidated': { keys: string[] };
  'config:changed': { section: string };
  'package:installed': { packageId: string; version: string; projectPath: string };
  'package:uninstalled': { packageId: string; projectPath: string };
  'source:discovered': { source: { name: string; url: string } };
}

export interface IEventBus {
  /**
   * Emit an event to all subscribers.
   * Errors from handlers are swallowed (logged but not propagated).
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void;

  /**
   * Subscribe to an event.
   * Returns a disposable that unsubscribes when disposed.
   */
  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;

  /**
   * Subscribe to an event once.
   * Auto-unsubscribes after first emission.
   */
  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable;
}

export class EventBus implements IEventBus {
  private readonly listeners = new Map<string, Set<(data: unknown) => void>>();

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const eventKey = event as string;
    const handlers = this.listeners.get(eventKey);
    if (!handlers) return;

    // Call handlers in isolation (errors don't crash other handlers)
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        // In production, this would go to LoggerService
        console.error(`EventBus handler error for '${eventKey}':`, error);
      }
    });
  }

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const eventKey = event as string;
    let handlers = this.listeners.get(eventKey);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(eventKey, handlers);
    }
    handlers.add(handler as (data: unknown) => void);

    return {
      dispose: () => {
        handlers?.delete(handler as (data: unknown) => void);
      },
    };
  }

  once<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): Disposable {
    const subscription = this.on(event, data => {
      subscription.dispose();
      handler(data);
    });
    return subscription;
  }
}
