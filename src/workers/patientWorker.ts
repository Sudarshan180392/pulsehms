// src/workers/patientWorker.ts
// Runs in a separate thread — no DOM, no React, no imports from main bundle

import type { Patient, FilterState, SortState, CensusStats, WorkerInMessage, WorkerOutMessage } from '../types';

let allPatients: Patient[] = [];
let currentFilter: FilterState = {
  status: [], acuityMin: 1, acuityMax: 5, unit_ids: [], search: '',
  fall_risk: [], isolation_type: [], code_status: [],
  attending_provider_id: '', los_threshold_hours: null, has_flags: null,
};
let currentSort: SortState = { columns: [{ key: 'acuity', dir: 'desc' }] };
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Filter logic ──────────────────────────────────────────────────────────
function applyFilters(patients: Patient[], f: FilterState): number[] {
  const indices: number[] = [];
  const searchLower = f.search.toLowerCase();

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    if (f.status.length && !f.status.includes(p.status)) continue;
    if (p.acuity < f.acuityMin || p.acuity > f.acuityMax) continue;
    if (f.unit_ids.length && (!p.unit_id || !f.unit_ids.includes(p.unit_id))) continue;
    if (f.fall_risk.length && !f.fall_risk.includes(p.fall_risk)) continue;
    if (f.isolation_type.length) {
      if (!p.isolation_type || !f.isolation_type.includes(p.isolation_type)) continue;
    }
    if (f.code_status.length && !f.code_status.includes(p.code_status)) continue;
    if (f.attending_provider_id && p.attending_provider_id !== f.attending_provider_id) continue;
    if (f.los_threshold_hours !== null && p.los_hours < f.los_threshold_hours) continue;
    if (f.has_flags === true && (!p.flags || p.flags.length === 0)) continue;
    if (f.has_flags === false && p.flags && p.flags.length > 0) continue;
    if (searchLower) {
      const hay = `${p.first_name} ${p.last_name} ${p.mrn} ${p.chief_complaint} ${p.admitting_dx}`.toLowerCase();
      if (!hay.includes(searchLower)) continue;
    }
    indices.push(i);
  }
  return indices;
}

// ─── Sort logic ────────────────────────────────────────────────────────────
function applySort(indices: number[], patients: Patient[], s: SortState): number[] {
  return [...indices].sort((ai, bi) => {
    for (const col of s.columns) {
      const a = patients[ai][col.key];
      const b = patients[bi][col.key];
      let cmp = 0;
      if (typeof a === 'number' && typeof b === 'number') cmp = a - b;
      else if (typeof a === 'string' && typeof b === 'string') cmp = a.localeCompare(b);
      if (cmp !== 0) return col.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });
}

// ─── Aggregate stats ───────────────────────────────────────────────────────
function computeStats(filteredIndices: number[], patients: Patient[]): CensusStats {
  const by_acuity: Record<number, number> = {1:0,2:0,3:0,4:0,5:0};
  const by_status: Record<string, number> = {};
  let total_los = 0;
  let patients_over_target_los = 0;

  for (const i of filteredIndices) {
    const p = patients[i];
    by_acuity[p.acuity] = (by_acuity[p.acuity] || 0) + 1;
    by_status[p.status] = (by_status[p.status] || 0) + 1;
    total_los += p.los_hours;
    if (p.los_hours > 72) patients_over_target_los++;
  }

  return {
    by_acuity,
    by_status,
    avg_los: filteredIndices.length ? +(total_los / filteredIndices.length).toFixed(1) : 0,
    patients_over_target_los,
    beds_available: 0, // would need bed data - main thread can augment
    nurse_ratio_violations: [],
    total: patients.length,
    filtered: filteredIndices.length,
  };
}

// ─── Handoff list ──────────────────────────────────────────────────────────
function computeHandoffList(patients: Patient[]): string[] {
  const now = Date.now();
  const fourHours = 4 * 3600 * 1000;
  return patients
    .filter(p => {
      if (p.status !== 'admitted') return false;
      if (p.acuity >= 4) return true; // critical always flagged
      if (p.expected_discharge) {
        const edTime = new Date(p.expected_discharge).getTime();
        if (edTime - now <= fourHours && edTime > now) return true;
      }
      if (p.los_hours > 120) return true;
      return false;
    })
    .map(p => p.id);
}

// ─── Process and emit ──────────────────────────────────────────────────────
function processAndEmit() {
  const filtered = applyFilters(allPatients, currentFilter);
  const sorted = applySort(filtered, allPatients, currentSort);
  const stats = computeStats(sorted, allPatients);
  const msg: WorkerOutMessage = { type: 'RESULT', payload: { indices: sorted, stats } };
  self.postMessage(msg);
}

// ─── Message handler ───────────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
  const { type, payload } = e.data;

  if (type === 'LOAD') {
    allPatients = payload as Patient[];
    processAndEmit();
    return;
  }

  if (type === 'FILTER') {
    currentFilter = payload as FilterState;
    // Debounce 100ms
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAndEmit, 100);
    return;
  }

  if (type === 'SORT') {
    currentSort = payload as SortState;
    processAndEmit();
    return;
  }

  if (type === 'AGGREGATE') {
    processAndEmit();
    return;
  }

  if (type === 'COMPUTE_HANDOFF_LIST') {
    const ids = computeHandoffList(allPatients);
    const msg: WorkerOutMessage = { type: 'HANDOFF_LIST', payload: { patient_ids: ids } };
    self.postMessage(msg);
    return;
  }
};

// Signal ready
self.postMessage({ type: 'READY' } as WorkerOutMessage);
