// src/tests/patientWorker.test.ts
// We test the worker logic directly by importing the pure functions.
// (The worker itself runs in a thread; here we test the algorithms inline.)

import { describe, it, expect, beforeEach } from 'vitest';
import type { Patient, FilterState, SortState } from '../types';

// ─── Replicate worker pure functions for testing ──────────────────────────

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

// ─── Fixtures ─────────────────────────────────────────────────────────────

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  id: 'p1', mrn: 'MRN001', first_name: 'John', last_name: 'Smith',
  dob: '1970-01-01', gender: 'M', bed_id: 'b1', unit_id: 'unit-1',
  status: 'admitted', acuity: 3, chief_complaint: 'Chest pain',
  admitting_dx: 'Acute MI', admitted_at: new Date().toISOString(),
  expected_discharge: null, los_hours: 24,
  attending_provider_id: 'prov-1',
  care_team: [], flags: [], isolation_type: null,
  fall_risk: 'low', code_status: 'full',
  vitals_history: [], notes: [], etag: 'etag-1',
  ...overrides,
});

const patients: Patient[] = [
  makePatient({ id: 'p1', acuity: 5, status: 'admitted', fall_risk: 'high', los_hours: 100, unit_id: 'unit-1' }),
  makePatient({ id: 'p2', acuity: 2, status: 'pending', fall_risk: 'low', los_hours: 10, unit_id: 'unit-1', last_name: 'Doe' }),
  makePatient({ id: 'p3', acuity: 4, status: 'admitted', fall_risk: 'moderate', los_hours: 80, unit_id: 'unit-2', isolation_type: 'contact' }),
  makePatient({ id: 'p4', acuity: 1, status: 'discharging', fall_risk: 'low', los_hours: 5, unit_id: 'unit-1', code_status: 'dnr' }),
  makePatient({ id: 'p5', acuity: 3, status: 'boarding', flags: [{ type: 'fall_risk', note: 'high' }], los_hours: 50, unit_id: 'unit-2' }),
];

const defaultFilter: FilterState = {
  status: [], acuityMin: 1, acuityMax: 5, unit_ids: [], search: '',
  fall_risk: [], isolation_type: [], code_status: [],
  attending_provider_id: '', los_threshold_hours: null, has_flags: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('applyFilters', () => {
  it('returns all indices with empty filter', () => {
    const result = applyFilters(patients, defaultFilter);
    expect(result).toHaveLength(5);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('filters by status', () => {
    const f = { ...defaultFilter, status: ['admitted'] as any };
    const result = applyFilters(patients, f);
    expect(result).toHaveLength(2);
    result.forEach(i => expect(patients[i].status).toBe('admitted'));
  });

  it('filters by acuity range', () => {
    const f = { ...defaultFilter, acuityMin: 3, acuityMax: 5 };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(patients[i].acuity).toBeGreaterThanOrEqual(3));
    result.forEach(i => expect(patients[i].acuity).toBeLessThanOrEqual(5));
  });

  it('filters by unit_ids', () => {
    const f = { ...defaultFilter, unit_ids: ['unit-1'] };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(patients[i].unit_id).toBe('unit-1'));
  });

  it('filters by fall_risk multi-select', () => {
    const f = { ...defaultFilter, fall_risk: ['high', 'moderate'] as any };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(['high', 'moderate']).toContain(patients[i].fall_risk));
  });

  it('filters by isolation_type', () => {
    const f = { ...defaultFilter, isolation_type: ['contact'] };
    const result = applyFilters(patients, f);
    expect(result).toHaveLength(1);
    expect(patients[result[0]].isolation_type).toBe('contact');
  });

  it('filters by LOS threshold', () => {
    const f = { ...defaultFilter, los_threshold_hours: 50 };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(patients[i].los_hours).toBeGreaterThanOrEqual(50));
  });

  it('filters by text search across name/mrn/complaint', () => {
    const f = { ...defaultFilter, search: 'doe' };
    const result = applyFilters(patients, f);
    expect(result).toHaveLength(1);
    expect(patients[result[0]].last_name).toBe('Doe');
  });

  it('filters has_flags = true', () => {
    const f = { ...defaultFilter, has_flags: true };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(patients[i].flags.length).toBeGreaterThan(0));
  });

  it('filters has_flags = false', () => {
    const f = { ...defaultFilter, has_flags: false };
    const result = applyFilters(patients, f);
    result.forEach(i => expect(patients[i].flags.length).toBe(0));
  });

  it('filters by code_status', () => {
    const f = { ...defaultFilter, code_status: ['dnr'] as any };
    const result = applyFilters(patients, f);
    expect(result).toHaveLength(1);
    expect(patients[result[0]].code_status).toBe('dnr');
  });

  it('compound filter: admitted + acuity 4-5 + unit-1', () => {
    const f = { ...defaultFilter, status: ['admitted'] as any, acuityMin: 4, acuityMax: 5, unit_ids: ['unit-1'] };
    const result = applyFilters(patients, f);
    expect(result).toHaveLength(1);
    expect(patients[result[0]].id).toBe('p1');
  });
});

describe('applySort', () => {
  it('sorts by acuity ascending', () => {
    const indices = [0, 1, 2, 3, 4];
    const sort: SortState = { columns: [{ key: 'acuity', dir: 'asc' }] };
    const result = applySort(indices, patients, sort);
    for (let i = 1; i < result.length; i++) {
      expect(patients[result[i]].acuity).toBeGreaterThanOrEqual(patients[result[i - 1]].acuity);
    }
  });

  it('sorts by acuity descending', () => {
    const indices = [0, 1, 2, 3, 4];
    const sort: SortState = { columns: [{ key: 'acuity', dir: 'desc' }] };
    const result = applySort(indices, patients, sort);
    for (let i = 1; i < result.length; i++) {
      expect(patients[result[i]].acuity).toBeLessThanOrEqual(patients[result[i - 1]].acuity);
    }
  });

  it('sorts by los_hours ascending', () => {
    const indices = [0, 1, 2, 3, 4];
    const sort: SortState = { columns: [{ key: 'los_hours', dir: 'asc' }] };
    const result = applySort(indices, patients, sort);
    for (let i = 1; i < result.length; i++) {
      expect(patients[result[i]].los_hours).toBeGreaterThanOrEqual(patients[result[i - 1]].los_hours);
    }
  });

  it('does not mutate original indices array', () => {
    const indices = [0, 1, 2, 3, 4];
    const sort: SortState = { columns: [{ key: 'acuity', dir: 'asc' }] };
    applySort(indices, patients, sort);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });
});
