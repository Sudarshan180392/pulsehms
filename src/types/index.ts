// ─── Core Domain Types ─────────────────────────────────────────────────────

export interface Unit {
  id: string;
  name: string;
  floor: number;
  specialty: string;
  total_beds: number;
  staffed_beds: number;
  target_census: number;
}

export interface Bed {
  id: string;
  unit_id: string;
  room: string;
  bed_number: string;
  status: 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked';
  patient_id: string | null;
  isolation_type: string | null;
  telemetry_equipped: boolean;
}

export interface CareTeamMember {
  role: string;
  name: string;
}

export interface PatientFlag {
  type: string;
  note: string;
}

export interface VitalsEntry {
  timestamp: string;
  hr: number;
  sbp: number;
  dbp: number;
  spo2: number;
  temp: number;
  rr: number;
}

export interface NoteEntry {
  author: string;
  text: string;
  timestamp: string;
}

export interface Patient {
  id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: 'M' | 'F' | 'X';
  bed_id: string | null;
  unit_id: string | null;
  status: 'admitted' | 'pending' | 'discharging' | 'boarding';
  acuity: 1 | 2 | 3 | 4 | 5;
  chief_complaint: string;
  admitting_dx: string;
  admitted_at: string;
  expected_discharge: string | null;
  los_hours: number;
  attending_provider_id: string;
  care_team: CareTeamMember[];
  flags: PatientFlag[];
  isolation_type: string | null;
  fall_risk: 'low' | 'moderate' | 'high';
  code_status: 'full' | 'dnr' | 'dnar' | 'comfort';
  vitals_history: VitalsEntry[];
  notes: NoteEntry[];
  etag: string;
}

export interface Alert {
  id: string;
  unit_id: string;
  patient_id: string | null;
  alert_type: string;
  severity: 'critical' | 'high' | 'medium';
  message: string;
  fired_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  auto_resolves_at: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'rn' | 'cna' | 'md' | 'np' | 'charge_rn' | 'transport';
  unit_id: string;
  shift: 'day' | 'evening' | 'night';
  patient_ids: string[];
  patient_ratio: number;
}

export interface CensusSummary {
  unit_id: string;
  total_beds: number;
  occupied: number;
  available: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
  occupancy_pct: number;
  avg_acuity: number;
  critical_count: number;
}

// ─── Worker Types ──────────────────────────────────────────────────────────

export interface FilterState {
  status: Patient['status'][];
  acuityMin: number;
  acuityMax: number;
  unit_ids: string[];
  search: string;
  fall_risk: Patient['fall_risk'][];
  isolation_type: string[];
  code_status: Patient['code_status'][];
  attending_provider_id: string;
  los_threshold_hours: number | null;
  has_flags: boolean | null;
}

export interface SortState {
  columns: Array<{ key: keyof Patient; dir: 'asc' | 'desc' }>;
}

export interface CensusStats {
  by_acuity: Record<number, number>;
  by_status: Record<string, number>;
  avg_los: number;
  patients_over_target_los: number;
  beds_available: number;
  nurse_ratio_violations: string[];
  total: number;
  filtered: number;
}

export type WorkerInMessage =
  | { type: 'LOAD'; payload: Patient[] }
  | { type: 'FILTER'; payload: FilterState }
  | { type: 'SORT'; payload: SortState }
  | { type: 'AGGREGATE'; payload: { unit_ids: string[] } }
  | { type: 'COMPUTE_HANDOFF_LIST'; payload: Record<string, unknown> };

export type WorkerOutMessage =
  | { type: 'RESULT'; payload: { indices: number[]; stats: CensusStats } }
  | { type: 'HANDOFF_LIST'; payload: { patient_ids: string[] } }
  | { type: 'READY' };

// ─── SSE Event Types ──────────────────────────────────────────────────────

export interface SSEEventMap {
  BED_STATUS_CHANGED: { bed_id: string; new_status: Bed['status']; patient_id?: string };
  PATIENT_ADMITTED: Patient;
  PATIENT_DISCHARGED: { patient_id: string; bed_id: string; timestamp: string };
  PATIENT_TRANSFERRED: { patient_id: string; from_bed: string; to_bed: string; to_unit: string };
  ALERT_FIRED: Alert;
  ALERT_RESOLVED: { alert_id: string; resolved_at: string };
  TELEMETRY_SPIKE: { patient_id: string; vital: string; value: number; threshold: number };
  STAFF_UPDATED: StaffMember;
  HEARTBEAT: { server_time: string };
}

export type SSEEventType = keyof SSEEventMap;
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

// ─── View State ──────────────────────────────────────────────────────────

export interface ViewState {
  selectedUnitId: string | null;
  activePanel: 'bedmap' | 'patientlog' | 'both';
  filters: FilterState;
  sort: SortState;
  zoomLevel: number;
  expandedPanels: string[];
}

export const DEFAULT_FILTERS: FilterState = {
  status: [],
  acuityMin: 1,
  acuityMax: 5,
  unit_ids: [],
  search: '',
  fall_risk: [],
  isolation_type: [],
  code_status: [],
  attending_provider_id: '',
  los_threshold_hours: null,
  has_flags: null,
};

export const DEFAULT_SORT: SortState = {
  columns: [{ key: 'acuity', dir: 'desc' }],
};
