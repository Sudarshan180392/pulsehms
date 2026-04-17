// src/store/index.ts
import { create } from 'zustand';
import type { Unit, Bed, Patient, Alert, StaffMember, CensusStats, FilterState, SortState, ConnectionState, ViewState } from '../types';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../types';

interface UnitStore {
  // Connection
  connectionState: ConnectionState;
  lastUpdateAt: string | null;
  queuedEventCount: number;

  // Data
  units: Unit[];
  beds: Record<string, Bed>;
  patients: Patient[];
  alerts: Alert[];
  staff: StaffMember[];

  // Worker results
  filteredIndices: number[];
  censusStats: CensusStats | null;

  // View state
  selectedUnitId: string | null;
  activePanel: 'bedmap' | 'patientlog' | 'both';
  filters: FilterState;
  sort: SortState;
  zoomLevel: number;
  selectedBedId: string | null;
  selectedPatientId: string | null;
  alertMuted: boolean;
  expandedRows: Set<string>;

  // Optimistic pending
  pendingAlerts: Record<string, boolean>; // alertId → pending ack

  // Actions
  setConnectionState: (s: ConnectionState) => void;
  setUnits: (units: Unit[]) => void;
  setBed: (bed: Bed) => void;
  setBeds: (beds: Bed[]) => void;
  setPatients: (patients: Patient[]) => void;
  upsertPatient: (patient: Patient) => void;
  removePatient: (id: string) => void;
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlertOptimistic: (id: string) => void;
  acknowledgeAlertRollback: (id: string) => void;
  confirmAlertAck: (id: string, by: string, at: string) => void;
  setStaff: (staff: StaffMember[]) => void;
  upsertStaff: (member: StaffMember) => void;
  setFilteredIndices: (indices: number[], stats: CensusStats) => void;
  setSelectedUnit: (id: string | null) => void;
  setActivePanel: (p: 'bedmap' | 'patientlog' | 'both') => void;
  setFilters: (f: Partial<FilterState>) => void;
  setSort: (s: SortState) => void;
  setZoom: (z: number) => void;
  setSelectedBed: (id: string | null) => void;
  setSelectedPatient: (id: string | null) => void;
  toggleAlertMute: () => void;
  toggleRowExpanded: (id: string) => void;
  setQueuedEventCount: (n: number) => void;
  setLastUpdate: (t: string) => void;
}

export const useUnitStore = create<UnitStore>((set, get) => ({
  connectionState: 'connecting',
  lastUpdateAt: null,
  queuedEventCount: 0,
  units: [],
  beds: {},
  patients: [],
  alerts: [],
  staff: [],
  filteredIndices: [],
  censusStats: null,
  selectedUnitId: null,
  activePanel: 'both',
  filters: DEFAULT_FILTERS,
  sort: DEFAULT_SORT,
  zoomLevel: 1,
  selectedBedId: null,
  selectedPatientId: null,
  alertMuted: false,
  expandedRows: new Set(),
  pendingAlerts: {},

  setConnectionState: (connectionState) => set({ connectionState }),
  setLastUpdate: (lastUpdateAt) => set({ lastUpdateAt }),
  setQueuedEventCount: (queuedEventCount) => set({ queuedEventCount }),

  setUnits: (units) => set({ units }),
  setBed: (bed) => set((s) => ({ beds: { ...s.beds, [bed.id]: bed } })),
  setBeds: (beds) => set({ beds: Object.fromEntries(beds.map(b => [b.id, b])) }),

  setPatients: (patients) => set({ patients }),
  upsertPatient: (patient) => set((s) => {
    const idx = s.patients.findIndex(p => p.id === patient.id);
    const next = [...s.patients];
    if (idx >= 0) next[idx] = patient; else next.push(patient);
    return { patients: next };
  }),
  removePatient: (id) => set((s) => ({ patients: s.patients.filter(p => p.id !== id) })),

  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts] })),
  acknowledgeAlertOptimistic: (id) => set((s) => ({ pendingAlerts: { ...s.pendingAlerts, [id]: true } })),
  acknowledgeAlertRollback: (id) => set((s) => {
    const p = { ...s.pendingAlerts }; delete p[id]; return { pendingAlerts: p };
  }),
  confirmAlertAck: (id, by, at) => set((s) => {
    const p = { ...s.pendingAlerts }; delete p[id];
    const alerts = s.alerts.map(a => a.id === id ? { ...a, acknowledged_by: by, acknowledged_at: at } : a);
    return { alerts, pendingAlerts: p };
  }),

  setStaff: (staff) => set({ staff }),
  upsertStaff: (member) => set((s) => {
    const idx = s.staff.findIndex(x => x.id === member.id);
    const next = [...s.staff];
    if (idx >= 0) next[idx] = member; else next.push(member);
    return { staff: next };
  }),

  setFilteredIndices: (filteredIndices, censusStats) => set({ filteredIndices, censusStats }),
  setSelectedUnit: (selectedUnitId) => set({ selectedUnitId, selectedBedId: null, selectedPatientId: null }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setSort: (sort) => set({ sort }),
  setZoom: (zoomLevel) => set({ zoomLevel }),
  setSelectedBed: (selectedBedId) => set({ selectedBedId }),
  setSelectedPatient: (selectedPatientId) => set({ selectedPatientId }),
  toggleAlertMute: () => set((s) => ({ alertMuted: !s.alertMuted })),
  toggleRowExpanded: (id) => set((s) => {
    const next = new Set(s.expandedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { expandedRows: next };
  }),
}));
