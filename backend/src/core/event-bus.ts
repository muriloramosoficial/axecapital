import { EventEmitter } from 'node:events';
import type { EventType, SystemEvent } from './types.js';

let seq = 0;
export const uid = (prefix = 'id') => `${prefix}_${(++seq).toString(36)}_${Date.now().toString(36)}`;

/**
 * Central, framework-agnostic event bus. Every engine publishes here and the
 * transport layer (WebSocket) simply mirrors it to the browser.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private history: SystemEvent[] = [];
  readonly maxHistory = 400;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<T>(type: EventType, payload: T, at = Date.now()): SystemEvent<T> {
    const evt: SystemEvent<T> = { id: uid('ev'), type, at, payload };
    if (type !== 'MARKET_TICK') {
      this.history.push(evt);
      if (this.history.length > this.maxHistory) this.history.shift();
    }
    this.emitter.emit(type, evt);
    this.emitter.emit('*', evt);
    return evt;
  }

  on<T>(type: EventType | '*', handler: (evt: SystemEvent<T>) => void) {
    this.emitter.on(type, handler as any);
    return () => this.emitter.off(type, handler as any);
  }

  recent(limit = 120) {
    return this.history.slice(-limit);
  }
}

export const bus = new EventBus();
