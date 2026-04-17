// src/App.tsx
import React, { useEffect, useState, Suspense, useTransition, useDeferredValue } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnitStore } from './store';
import { sseManager } from './services/sseManager';
import { usePatientWorker } from './hooks/usePatientWorker';
import { useUnitViewState } from './hooks/useUnitViewState';
import { useUnits, useCensus, usePatients, useAlerts, useStaff } from './hooks/useApi';
import { ActionModal } from './components/ActionModal';
import { PatientLog } from './components/PatientLog';
import { AlertPanel } from './components/AlertPanel';
import type { ConnectionState } from './types';
import { BedMap } from './components/BedMap';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 10_000 } } });

// ─── Error Boundary ───────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── Connection indicator ─────────────────────────────────────────────────
const CONN_STYLES: Record<ConnectionState, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  reconnecting: 'bg-orange-500 animate-pulse',
  offline: 'bg-red-500',
};

function Dashboard() {
  const store = useUnitStore();
  const { loadPatients, applyFilter, applySort } = usePatientWorker();
  const { } = useUnitViewState(); // initialises URL state on mount

  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredFilters = useDeferredValue(store.filters);

  // Load units
  const { data: units } = useUnits();
  const unitId = store.selectedUnitId;

  // Load data for selected unit
  const { data: census } = useCensus(unitId);
  const { data: patients } = usePatients(unitId);
  const { data: alerts } = useAlerts(unitId);
  const { data: staff } = useStaff(unitId);

  // Sync units into store & auto-select first
  useEffect(() => {
    if (units) {
      store.setUnits(units);
      if (!store.selectedUnitId) store.setSelectedUnit(units[0]?.id ?? null);
    }
  }, [units]);

  // Sync census beds
  useEffect(() => {
    if (census?.beds) store.setBeds(census.beds);
  }, [census]);

  // Sync patients into store AND worker
  useEffect(() => {
    if (patients) {
      store.setPatients(patients);
      loadPatients(patients);
    }
  }, [patients, loadPatients]);

  // Sync alerts
  useEffect(() => {
    if (alerts) store.setAlerts(alerts);
  }, [alerts]);

  // Sync staff
  useEffect(() => {
    if (staff) store.setStaff(staff);
  }, [staff]);

  // Re-filter when deferred filters change
  useEffect(() => {
    applyFilter(deferredFilters);
  }, [deferredFilters, applyFilter]);

  // Re-sort when sort changes
  useEffect(() => {
    applySort(store.sort);
  }, [store.sort, applySort]);

  // SSE connection
  useEffect(() => {
    if (!unitId) return;
    sseManager.connect(unitId);
    const unsub = sseManager.onStateChange(s => {
      setConnState(s);
      if (s === 'connected') setLastUpdate(new Date().toISOString());
    });

    const u1 = sseManager.subscribe('BED_STATUS_CHANGED', (p) => {
      const beds = { ...store.beds };
      if (beds[p.bed_id]) {
        beds[p.bed_id] = { ...beds[p.bed_id], status: p.new_status, patient_id: p.patient_id ?? null };
        store.setBeds(Object.values(beds));
      }
      setLastUpdate(new Date().toISOString());
    });

    const u2 = sseManager.subscribe('PATIENT_ADMITTED', (p) => {
      store.upsertPatient(p);
      setLastUpdate(new Date().toISOString());
    });

    const u3 = sseManager.subscribe('PATIENT_DISCHARGED', (p) => {
      store.removePatient(p.patient_id);
      setLastUpdate(new Date().toISOString());
    });

    const u4 = sseManager.subscribe('ALERT_FIRED', (a) => {
      store.addAlert(a);
      setLastUpdate(new Date().toISOString());
    });

    const u5 = sseManager.subscribe('ALERT_RESOLVED', (p) => {
      store.confirmAlertAck(p.alert_id, 'system', p.resolved_at);
    });

    const u6 = sseManager.subscribe('STAFF_UPDATED', (s) => {
      store.upsertStaff(s);
    });

    return () => { unsub(); u1(); u2(); u3(); u4(); u5(); u6(); sseManager.disconnect(); };
  }, [unitId]);

  const selectedUnit = store.units.find(u => u.id === unitId);
  const beds = Object.values(store.beds);
  const selectedBed = store.selectedBedId ? store.beds[store.selectedBedId] : null;
  const selectedPatientForModal = selectedBed?.patient_id
    ? store.patients.find(p => p.id === selectedBed.patient_id) ?? null
    : null;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-xs font-bold">P</div>
          <span className="font-semibold text-sm tracking-wide text-slate-100">PulseOps</span>
          <span className="text-slate-600 text-xs">Unit Command View</span>
        </div>

        {/* Unit selector */}
        <select
          value={unitId ?? ''}
          onChange={e => store.setSelectedUnit(e.target.value)}
          className="ml-4 bg-slate-800 text-slate-200 text-sm rounded px-2 py-1 border border-slate-700"
          aria-label="Select unit"
        >
          {store.units.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        {/* Census summary */}
        {selectedUnit && census?.summary && (
          <div className="flex gap-3 ml-2 text-xs font-mono">
            <span className="text-slate-400">Beds: <b className="text-slate-200">{census.summary.occupied}/{selectedUnit.total_beds}</b></span>
            <span className="text-slate-400">Avail: <b className="text-green-400">{census.summary.available}</b></span>
            <span className="text-slate-400">Occupancy: <b className="text-slate-200">{census.summary.occupancy_pct}%</b></span>
          </div>
        )}

        {/* Panel layout toggle */}
        <div className="flex gap-1 ml-auto">
          {(['bedmap','both','patientlog'] as const).map(p => (
            <button
              key={p}
              onClick={() => store.setActivePanel(p)}
              className={`text-xs px-2 py-1 rounded ${store.activePanel === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              {p === 'both' ? 'Both' : p === 'bedmap' ? 'Map' : 'List'}
            </button>
          ))}
        </div>

        {/* Connection state */}
        <div className="flex items-center gap-2 ml-3">
          <div className={`w-2 h-2 rounded-full ${CONN_STYLES[connState]}`} title={connState} />
          <span className="text-xs text-slate-500 capitalize">{connState}</span>
          {lastUpdate && <span className="text-xs text-slate-600">{new Date(lastUpdate).toLocaleTimeString()}</span>}
        </div>
      </header>

      {/* ── Offline banner ───────────────────────────────────────────── */}
      {connState === 'offline' && (
        <div role="alert" className="bg-red-900/70 border-b border-red-800 px-4 py-1.5 text-xs text-red-200 flex items-center gap-2">
          ⚠ Connection lost. Data may be stale. Last update: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'unknown'}
          {store.queuedEventCount > 0 && ` · ${store.queuedEventCount} events queued for replay`}
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900/50 border-b border-slate-800 shrink-0">
        <input
          type="search"
          placeholder="Search name, MRN, diagnosis…"
          value={store.filters.search}
          onChange={e => startTransition(() => store.setFilters({ search: e.target.value }))}
          className="bg-slate-800 text-slate-200 text-xs rounded px-3 py-1.5 border border-slate-700 w-56"
          aria-label="Search patients"
        />
        <select
          value={store.filters.status[0] ?? ''}
          onChange={e => store.setFilters({ status: e.target.value ? [e.target.value as any] : [] })}
          className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-1.5 border border-slate-700"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="admitted">Admitted</option>
          <option value="pending">Pending</option>
          <option value="discharging">Discharging</option>
          <option value="boarding">Boarding</option>
        </select>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <label>Acuity</label>
          <input type="number" min={1} max={5} value={store.filters.acuityMin}
            onChange={e => store.setFilters({ acuityMin: parseInt(e.target.value) || 1 })}
            className="w-10 bg-slate-800 text-slate-200 rounded px-1 py-1 border border-slate-700 text-center"
            aria-label="Minimum acuity"
          />
          <span>–</span>
          <input type="number" min={1} max={5} value={store.filters.acuityMax}
            onChange={e => store.setFilters({ acuityMax: parseInt(e.target.value) || 5 })}
            className="w-10 bg-slate-800 text-slate-200 rounded px-1 py-1 border border-slate-700 text-center"
            aria-label="Maximum acuity"
          />
        </div>
        {store.censusStats && (
          <div className="ml-auto flex gap-3 text-xs font-mono text-slate-500">
            <span>Showing <b className="text-slate-300">{store.censusStats.filtered}</b> / {store.censusStats.total}</span>
            <span>Avg LOS <b className="text-slate-300">{store.censusStats.avg_los}h</b></span>
          </div>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden gap-2 p-2">

        {/* Left: Bed Map */}
        {(store.activePanel === 'bedmap' || store.activePanel === 'both') && (
          <div className={`${store.activePanel === 'both' ? 'w-1/2' : 'flex-1'} min-w-0`}>
            <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-red-400 text-sm">Bed map error</div>}>
              <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading bed map…</div>}>
                <BedMap
                  beds={beds}
                  patients={store.patients}
                  selectedBedId={store.selectedBedId}
                  onBedSelect={(id) => {
                    store.setSelectedBed(id);
                    const bed = store.beds[id];
                    if (bed?.patient_id) store.setSelectedPatient(bed.patient_id);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {/* Right: Patient Log + Alert Panel */}
        {(store.activePanel === 'patientlog' || store.activePanel === 'both') && (
          <div className={`${store.activePanel === 'both' ? 'w-1/2' : 'flex-1'} flex flex-col gap-2 min-w-0`}>
            <div className="flex-1 min-h-0">
              <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-red-400 text-sm">Patient log error</div>}>
                <PatientLog patients={store.patients} filteredIndices={store.filteredIndices} />
              </ErrorBoundary>
            </div>
            <div className="h-64 shrink-0">
              <ErrorBoundary fallback={<div className="flex items-center justify-center h-full text-red-400 text-sm">Alert panel error</div>}>
                <AlertPanel unitId={unitId} />
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Modal ──────────────────────────────────────────────── */}
      {store.selectedBedId && (
        <ActionModal
          patient={selectedPatientForModal}
          availableBeds={beds}
          onClose={() => { store.setSelectedBed(null); store.setSelectedPatient(null); }}
        />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>
  );
}
