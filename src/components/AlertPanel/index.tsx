// src/components/AlertPanel/index.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Alert } from '../../types';
import { useUnitStore } from '../../store';
import { useAcknowledgeAlert } from '../../hooks/useApi';

// ─── Web Audio chime ──────────────────────────────────────────────────────
function playChime(severity: Alert['severity']) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = severity === 'critical' ? 880 : severity === 'high' ? 660 : 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch { /* AudioContext may be blocked */ }
}

// ─── Time ago ─────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ─── AlertRow ─────────────────────────────────────────────────────────────
const SEV_COLORS: Record<Alert['severity'], string> = {
  critical: 'border-red-500 bg-red-950/40',
  high: 'border-orange-500 bg-orange-950/30',
  medium: 'border-yellow-600 bg-yellow-950/20',
};
const SEV_TEXT: Record<Alert['severity'], string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
};

interface AlertRowProps {
  alert: Alert;
  pending: boolean;
  onAck: (id: string) => void;
}

function AlertRow({ alert: a, pending, onAck }: AlertRowProps) {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className={`border-l-2 rounded-r p-2 mb-1 ${SEV_COLORS[a.severity]} ${pending ? 'opacity-50' : ''}`}
      role="listitem"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold ${SEV_TEXT[a.severity]} uppercase tracking-wide`}>
            {a.severity} · {a.alert_type.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-slate-300 mt-0.5 truncate">{a.message}</div>
          <div className="text-xs text-slate-500 mt-0.5">{timeAgo(a.fired_at)}</div>
        </div>
        {!a.acknowledged_by && (
          <button
            onClick={() => onAck(a.id)}
            disabled={pending}
            className="shrink-0 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded disabled:opacity-40"
            aria-label={`Acknowledge alert: ${a.message}`}
          >
            {pending ? '…' : 'Ack'}
          </button>
        )}
        {a.acknowledged_by && (
          <span className="text-xs text-slate-500 shrink-0">✓ Acked</span>
        )}
      </div>
    </div>
  );
}

// ─── AlertPanel ────────────────────────────────────────────────────────────
interface AlertPanelProps {
  unitId: string | null;
}

export function AlertPanel({ unitId }: AlertPanelProps) {
  const { alerts, pendingAlerts, alertMuted, toggleAlertMute } = useUnitStore();
  const { mutate: ackAlert } = useAcknowledgeAlert();
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const prevCountRef = useRef(0);

  const unitAlerts = alerts.filter(a => !unitId || a.unit_id === unitId);
  const active = unitAlerts.filter(a => !a.acknowledged_by).sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2 };
    const sd = sevOrder[a.severity] - sevOrder[b.severity];
    return sd !== 0 ? sd : new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime();
  });
  const history = unitAlerts.filter(a => !!a.acknowledged_by);

  // Play chime on new critical/high
  useEffect(() => {
    if (alertMuted) return;
    if (active.length > prevCountRef.current) {
      const newest = active[0];
      if (newest && (newest.severity === 'critical' || newest.severity === 'high')) {
        playChime(newest.severity);
      }
    }
    prevCountRef.current = active.length;
  }, [active.length, alertMuted]);

  const handleAck = useCallback((alertId: string) => {
    ackAlert({ alertId, acknowledgedBy: 'current_user' });
  }, [ackAlert]);

  const filteredHistory = historySearch
    ? history.filter(a => a.message.toLowerCase().includes(historySearch.toLowerCase()))
    : history;

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">ALERTS</span>
        {active.length > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{active.length}</span>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={toggleAlertMute}
            className={`text-xs px-2 py-1 rounded ${alertMuted ? 'bg-red-900/50 text-red-400' : 'bg-slate-700 text-slate-400'}`}
            aria-label={alertMuted ? 'Unmute alerts' : 'Mute alerts'}
          >
            {alertMuted ? '🔇 Muted' : '🔔'}
          </button>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="text-xs px-2 py-1 bg-slate-700 text-slate-400 rounded"
          >
            History ({history.length})
          </button>
        </div>
      </div>

      {/* ARIA live region for screen readers */}
      <div role="status" aria-live="polite" aria-atomic="false" className="sr-only">
        {active.length > 0 && `${active.length} active alerts. Most recent: ${active[0]?.message}`}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {active.find(a => a.severity === 'critical')?.message ?? ''}
      </div>

      {/* Active alerts */}
      <div className="flex-1 overflow-y-auto p-2" role="list" aria-label="Active alerts">
        {active.length === 0 ? (
          <div className="text-center text-slate-500 text-xs mt-8">No active alerts</div>
        ) : (
          active.map(a => (
            <AlertRow
              key={a.id}
              alert={a}
              pending={!!pendingAlerts[a.id]}
              onAck={handleAck}
            />
          ))
        )}
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="border-t border-slate-700 bg-slate-950 flex flex-col" style={{ maxHeight: 240 }}>
          <div className="p-2 border-b border-slate-700 flex gap-2">
            <span className="text-xs text-slate-400 font-mono">HISTORY</span>
            <input
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search history..."
              className="flex-1 text-xs bg-slate-800 text-slate-300 rounded px-2 py-0.5 border border-slate-600"
              aria-label="Search alert history"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {filteredHistory.slice(0, 50).map(a => (
              <div key={a.id} className="text-xs text-slate-500 py-1 border-b border-slate-800 flex justify-between">
                <span className="truncate">{a.message}</span>
                <span className="ml-2 text-slate-600 shrink-0">✓ {a.acknowledged_by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
