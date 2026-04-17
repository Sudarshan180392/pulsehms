// src/tests/sseManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEManager } from '../services/sseManager';

// ─── Mock EventSource ─────────────────────────────────────────────────────
class MockEventSource {
  static CLOSED = 2;
  static OPEN = 1;
  readyState = MockEventSource.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => { this.readyState = MockEventSource.CLOSED; });

  triggerOpen() { this.onopen?.(); }
  triggerMessage(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
  triggerError() { this.readyState = MockEventSource.CLOSED; this.onerror?.(); }
}

let mockEs: MockEventSource;

vi.stubGlobal('EventSource', vi.fn(() => {
  mockEs = new MockEventSource();
  return mockEs;
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ beds: [] }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SSEManager('http://localhost:3001');
  });

  afterEach(() => {
    manager.disconnect();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('transitions to connected state on open', () => {
    const states: string[] = [];
    manager.onStateChange(s => states.push(s));
    manager.connect('unit-1');
    mockEs.triggerOpen();
    expect(states).toContain('connected');
  });

  it('calls subscriber when matching event arrives', () => {
    const handler = vi.fn();
    manager.connect('unit-1');
    mockEs.triggerOpen();
    manager.subscribe('HEARTBEAT', handler);
    mockEs.triggerMessage({ type: 'HEARTBEAT', payload: { server_time: new Date().toISOString() } });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not call subscriber for different event type', () => {
    const handler = vi.fn();
    manager.connect('unit-1');
    mockEs.triggerOpen();
    manager.subscribe('ALERT_FIRED', handler);
    mockEs.triggerMessage({ type: 'HEARTBEAT', payload: { server_time: new Date().toISOString() } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe stops handler from being called', () => {
    const handler = vi.fn();
    manager.connect('unit-1');
    mockEs.triggerOpen();
    const unsub = manager.subscribe('HEARTBEAT', handler);
    unsub();
    mockEs.triggerMessage({ type: 'HEARTBEAT', payload: { server_time: new Date().toISOString() } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('reconnects after missed heartbeat (15s timeout)', () => {
    const states: string[] = [];
    manager.onStateChange(s => states.push(s));
    manager.connect('unit-1');
    mockEs.triggerOpen();

    // Advance 15 seconds without a heartbeat
    vi.advanceTimersByTime(15_001);

    expect(states).toContain('reconnecting');
  });

  it('reconnects after connection error', () => {
    const states: string[] = [];
    manager.onStateChange(s => states.push(s));
    manager.connect('unit-1');
    mockEs.triggerOpen();
    mockEs.triggerError();

    expect(states).toContain('reconnecting');
  });

  it('subscriber isolation: one throwing handler does not break others', () => {
    const goodHandler = vi.fn();
    const badHandler = vi.fn(() => { throw new Error('boom'); });

    manager.connect('unit-1');
    mockEs.triggerOpen();
    manager.subscribe('HEARTBEAT', badHandler);
    manager.subscribe('HEARTBEAT', goodHandler);

    expect(() => {
      mockEs.triggerMessage({ type: 'HEARTBEAT', payload: { server_time: new Date().toISOString() } });
    }).not.toThrow();

    expect(goodHandler).toHaveBeenCalledOnce();
  });

  it('resets reconnect attempts to 0 on successful reconnect', () => {
    manager.connect('unit-1');
    mockEs.triggerOpen();
    mockEs.triggerError();

    // New connection opens successfully
    vi.advanceTimersByTime(1_500);
    mockEs.triggerOpen();

    const states: string[] = [];
    manager.onStateChange(s => states.push(s));
    // Should be connected now
    expect(manager.getState()).toBe('connected');
  });

  it('heartbeat resets the missed-heartbeat timer', () => {
    const states: string[] = [];
    manager.onStateChange(s => states.push(s));
    manager.connect('unit-1');
    mockEs.triggerOpen();

    // Send heartbeat at 10s (before 15s timeout)
    vi.advanceTimersByTime(10_000);
    mockEs.triggerMessage({ type: 'HEARTBEAT', payload: { server_time: new Date().toISOString() } });

    // Advance another 10s - should NOT have reconnected yet (timer was reset)
    vi.advanceTimersByTime(10_000);
    expect(states.filter(s => s === 'reconnecting')).toHaveLength(0);

    // Advance past the new 15s window
    vi.advanceTimersByTime(5_100);
    expect(states).toContain('reconnecting');
  });
});
