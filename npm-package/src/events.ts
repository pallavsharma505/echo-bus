export type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private _listeners = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: EventHandler): this {
    this._listeners.get(event)?.delete(handler);
    return this;
  }

  once(event: string, handler: EventHandler): this {
    const wrapper: EventHandler = (...args) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  protected emit(event: string, ...args: any[]): boolean {
    const handlers = this._listeners.get(event);
    if (!handlers || handlers.size === 0) return false;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {
        // Don't let one handler break others
      }
    }
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}
