// src/services/sseManager.ts
import type { SSEEventMap, SSEEventType, ConnectionState } from '../types';

type Handler<T extends SSEEventType> = (payload: SSEEventMap[T]) => void;
type AnyHandler = (payload: unknown) => void;
type StateListener = (state: ConnectionState) => void;

interface QueuedEvent {
  type: SSEEventType;
  payload: unknown;
  bed_id?: string;
}

const HEARTBEAT_TIMEOUT = 15_000;
const MAX_QUEUE = 200;
const INITIAL_BACKOFF = 1_000;
const MAX_BACKOFF = 30_000;

export class SSEManager {
  private es: EventSource | null = null;
  private unitId: string = '';
  private subscribers = new Map<SSEEventType, Set<AnyHandler>>();
  private stateListeners = new Set<StateListener>();
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private state: ConnectionState = 'connecting';
  private eventQueue: QueuedEvent[] = [];
  private baseUrl: string;

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  connect(unitId: string) {
    this.unitId = unitId;
    this.reconnectAttempts = 0;
    this._connect();
  }

  disconnect() {
    this._clearTimers();
    if (this.es) { this.es.close(); this.es = null; }
    this._setState('offline');
  }

  subscribe<T extends SSEEventType>(type: T, handler: Handler<T>): () => void {
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Set());
    this.subscribers.get(type)!.add(handler as AnyHandler);
    return () => this.subscribers.get(type)?.delete(handler as AnyHandler);
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state); // emit current state immediately
    return () => this.stateListeners.delete(listener);
  }

  getState(): ConnectionState { return this.state; }

  // ─── Internal ────────────────────────────────────────────────────────────

  private _connect() {
    this._clearTimers();
    this._setState('connecting');

    try {
      this.es = new EventSource(`${this.baseUrl}/stream?unit_id=${this.unitId}`);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.es.onopen = () => {
      this._setState('connected');
      this.reconnectAttempts = 0;
      this._resetHeartbeat();
      this._replayQueue();
    };

    this.es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as { type: SSEEventType; payload: unknown };
        this._handleEvent(event.type, event.payload);
      } catch { /* malformed event */ }
    };

    this.es.onerror = () => {
      if (this.es?.readyState === EventSource.CLOSED) {
        this._scheduleReconnect();
      }
    };
  }

  private _handleEvent(type: SSEEventType, payload: unknown) {
    if (type === 'HEARTBEAT') {
      this._resetHeartbeat();
      if (this.state !== 'connected') this._setState('connected');
    }

    // Notify subscribers - isolate each handler
    const handlers = this.subscribers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(payload); } catch (err) {
          console.error(`[SSEManager] subscriber error for ${type}:`, err);
        }
      }
    }
  }

  private _resetHeartbeat() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      console.warn('[SSEManager] Heartbeat missed — reconnecting');
      this._onHeartbeatMissed();
    }, HEARTBEAT_TIMEOUT);
  }

  private _onHeartbeatMissed() {
    this.es?.close();
    this._setState('reconnecting');
    this._scheduleReconnect();
    this._requestCatchupSnapshot().catch(console.error);
  }

  private _scheduleReconnect() {
    const jitter = (Math.random() - 0.5) * 0.5;
    const delay = Math.min(INITIAL_BACKOFF * Math.pow(2, this.reconnectAttempts) * (1 + jitter), MAX_BACKOFF);
    this.reconnectAttempts++;
    this._setState('reconnecting');
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private async _requestCatchupSnapshot() {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/units/${this.unitId}/census`);
      if (!res.ok) return;
      const data = await res.json();
      // Emit synthetic BED_STATUS_CHANGED for each bed in snapshot
      for (const bed of data.beds || []) {
        this._handleEvent('BED_STATUS_CHANGED', {
          bed_id: bed.id,
          new_status: bed.status,
          patient_id: bed.patient_id,
        });
      }
    } catch { /* offline */ }
  }

  private _replayQueue() {
    // Deduplicate by (bed_id, type) keeping latest
    const seen = new Map<string, QueuedEvent>();
    for (const ev of this.eventQueue) {
      const key = `${ev.bed_id ?? ev.type}_${ev.type}`;
      seen.set(key, ev);
    }
    this.eventQueue = [];
    for (const ev of seen.values()) {
      this._handleEvent(ev.type, ev.payload);
    }
  }

  private _enqueue(type: SSEEventType, payload: unknown, bed_id?: string) {
    if (this.eventQueue.length >= MAX_QUEUE) this.eventQueue.shift();
    this.eventQueue.push({ type, payload, bed_id });
  }

  private _setState(state: ConnectionState) {
    if (this.state === state) return;
    this.state = state;
    for (const l of this.stateListeners) { try { l(state); } catch { /* */ } }
  }

  private _clearTimers() {
    if (this.heartbeatTimer) { clearTimeout(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

// Singleton instance
export const sseManager = new SSEManager();
