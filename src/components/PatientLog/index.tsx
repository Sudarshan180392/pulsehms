// src/components/PatientLog/index.tsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { Patient } from '../../types';
import { useUnitStore } from '../../store';

const ROW_H_COLLAPSED = 44;
const ROW_H_EXPANDED = 140;
const OVERSCAN = 8;

// ─── Status badge ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  admitted: 'bg-blue-500/20 text-blue-300',
  pending: 'bg-yellow-500/20 text-yellow-300',
  discharging: 'bg-green-500/20 text-green-300',
  boarding: 'bg-purple-500/20 text-purple-300',
};

const ACUITY_COLORS = ['', 'text-green-400', 'text-yellow-300', 'text-orange-400', 'text-red-400', 'text-red-600'];

// ─── PatientRow ───────────────────────────────────────────────────────────
interface PatientRowProps {
  patient: Patient;
  expanded: boolean;
  selected: boolean;
  style: React.CSSProperties;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

const PatientRow = React.memo(({ patient: p, expanded, selected, style, onToggle, onSelect }: PatientRowProps) => (
  <div
    style={style}
    className={`border-b border-slate-700/50 select-none transition-colors ${selected ? 'bg-blue-900/30' : 'hover:bg-slate-800/40'}`}
    role="row"
    aria-selected={selected}
  >
    <div className="flex items-center h-11 px-3 gap-3 cursor-pointer" onClick={() => onSelect(p.id)}>
      {/* Checkbox */}
      <input type="checkbox" checked={selected} onChange={() => onSelect(p.id)} className="accent-blue-500" aria-label={`Select ${p.last_name}`} />

      {/* Acuity */}
      <span className={`font-bold text-sm w-4 ${ACUITY_COLORS[p.acuity]}`}>{p.acuity}</span>

      {/* Name */}
      <div className="w-36 min-w-0">
        <div className="text-sm text-slate-100 font-medium truncate">{p.last_name}, {p.first_name}</div>
        <div className="text-xs text-slate-500 font-mono">{p.mrn}</div>
      </div>

      {/* Status */}
      <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${STATUS_COLORS[p.status]}`}>{p.status}</span>

      {/* Chief complaint */}
      <span className="text-xs text-slate-400 flex-1 truncate hidden sm:block">{p.chief_complaint}</span>

      {/* LOS */}
      <span className="text-xs text-slate-400 w-14 text-right">
        {p.los_hours < 24 ? `${p.los_hours}h` : `${Math.floor(p.los_hours / 24)}d`}
      </span>

      {/* Fall risk */}
      {p.fall_risk === 'high' && <span className="text-xs text-amber-400" title="High fall risk">⚠</span>}

      {/* Isolation */}
      {p.isolation_type && <span className="text-xs text-red-400" title={`${p.isolation_type} isolation`}>🔴</span>}

      {/* Expand toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(p.id); }}
        className="text-slate-500 hover:text-slate-300 text-xs ml-1"
        aria-label={expanded ? 'Collapse row' : 'Expand row'}
        aria-expanded={expanded}
      >
        {expanded ? '▲' : '▼'}
      </button>
    </div>

    {/* Expanded panel */}
    {expanded && (
      <div className="px-3 pb-3 grid grid-cols-3 gap-2">
        {p.vitals_history.slice(0, 3).map((v, i) => (
          <div key={i} className="bg-slate-800 rounded p-2 text-xs">
            <div className="text-slate-500 mb-1">{new Date(v.timestamp).toLocaleTimeString()}</div>
            <div className="grid grid-cols-2 gap-1 text-slate-300">
              <span>HR: <b>{v.hr}</b></span>
              <span>BP: <b>{v.sbp}/{v.dbp}</b></span>
              <span>SpO₂: <b>{v.spo2}%</b></span>
              <span>Temp: <b>{v.temp}°F</b></span>
            </div>
          </div>
        ))}
        {p.flags.map((f, i) => (
          <div key={i} className="bg-amber-900/30 border border-amber-700/40 rounded p-2 text-xs text-amber-300">
            🚩 {f.note}
          </div>
        ))}
      </div>
    )}
  </div>
));
PatientRow.displayName = 'PatientRow';

// ─── PatientLog ───────────────────────────────────────────────────────────
interface PatientLogProps {
  patients: Patient[];
  filteredIndices: number[];
}

export function PatientLog({ patients, filteredIndices }: PatientLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { expandedRows, toggleRowExpanded, setSelectedPatient } = useUnitStore();

  // Compute row heights and cumulative offsets
  const { offsets, totalHeight } = useMemo(() => {
    const offs: number[] = new Array(filteredIndices.length);
    let cumulative = 0;
    for (let i = 0; i < filteredIndices.length; i++) {
      offs[i] = cumulative;
      const p = patients[filteredIndices[i]];
      cumulative += p && expandedRows.has(p.id) ? ROW_H_EXPANDED : ROW_H_COLLAPSED;
    }
    return { offsets: offs, totalHeight: cumulative };
  }, [filteredIndices, patients, expandedRows]);

  // ResizeObserver for container height
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Find visible range
  const { startIdx, endIdx } = useMemo(() => {
    let s = 0;
    while (s < offsets.length && offsets[s] + (patients[filteredIndices[s]]?.id && expandedRows.has(patients[filteredIndices[s]].id) ? ROW_H_EXPANDED : ROW_H_COLLAPSED) < scrollTop) s++;
    let e = s;
    while (e < offsets.length && offsets[e] < scrollTop + containerHeight) e++;
    return {
      startIdx: Math.max(0, s - OVERSCAN),
      endIdx: Math.min(filteredIndices.length - 1, e + OVERSCAN),
    };
  }, [scrollTop, containerHeight, offsets, filteredIndices, patients, expandedRows]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSelectedPatient(id);
  }, [setSelectedPatient]);

  // Ctrl+A select all filtered
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(filteredIndices.map(i => patients[i]?.id).filter(Boolean)));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredIndices, patients]);

  // Stats for footer
  const stats = useMemo(() => {
    const visible = filteredIndices.map(i => patients[i]).filter(Boolean);
    const avgAcuity = visible.length ? (visible.reduce((s, p) => s + p.acuity, 0) / visible.length).toFixed(1) : '0';
    const maxLos = visible.reduce((m, p) => Math.max(m, p.los_hours), 0);
    return { count: visible.length, avgAcuity, maxLos };
  }, [filteredIndices, patients]);

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-4 px-3 py-2 bg-slate-800 border-b border-slate-700 text-xs text-slate-400 font-mono sticky top-0 z-10"
        role="row"
      >
        <span className="w-4"></span>
        <span className="w-4">ACU</span>
        <span className="w-36">PATIENT</span>
        <span className="w-20">STATUS</span>
        <span className="flex-1 hidden sm:block">COMPLAINT</span>
        <span className="w-14 text-right">LOS</span>
        <span className="w-4"></span>
        <span className="w-4"></span>
        <span className="w-4"></span>
      </div>

      {/* Virtual scroll container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        onScroll={onScroll}
        role="grid"
        aria-label="Patient list"
        aria-rowcount={filteredIndices.length}
      >
        {/* Total height spacer */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {filteredIndices.slice(startIdx, endIdx + 1).map((dataIdx, vi) => {
            const rowIdx = startIdx + vi;
            const p = patients[dataIdx];
            if (!p) return null;
            const expanded = expandedRows.has(p.id);
            const h = expanded ? ROW_H_EXPANDED : ROW_H_COLLAPSED;
            return (
              <PatientRow
                key={p.id}
                patient={p}
                expanded={expanded}
                selected={selectedIds.has(p.id)}
                style={{
                  position: 'absolute',
                  top: offsets[rowIdx],
                  left: 0,
                  right: 0,
                  height: h,
                }}
                onToggle={toggleRowExpanded}
                onSelect={toggleSelect}
              />
            );
          })}
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex gap-4 px-3 py-2 bg-slate-800 border-t border-slate-700 text-xs text-slate-400 font-mono">
        <span>Patients: <b className="text-slate-200">{stats.count}</b></span>
        <span>Avg Acuity: <b className="text-slate-200">{stats.avgAcuity}</b></span>
        <span>Max LOS: <b className="text-slate-200">{stats.maxLos < 24 ? `${stats.maxLos}h` : `${Math.floor(stats.maxLos / 24)}d`}</b></span>
        <span>Selected: <b className="text-slate-200">{selectedIds.size}</b></span>
      </div>
    </div>
  );
}
