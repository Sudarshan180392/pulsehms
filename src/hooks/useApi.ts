// src/hooks/useApi.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUnitStore } from '../store';
import type { Patient, Alert } from '../types';

const BASE = '/api';

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    // queryFn: () => apiFetch<{ data: any[] }>(`${BASE}/units`).then(r => r.data),
    queryFn: () => apiFetch<{ data: any[] }>('/api/v1/units').then(r => r.data),
    staleTime: 60_000,
  });
}

export function useCensus(unitId: string | null) {
  return useQuery({
    queryKey: ['census', unitId],
    queryFn: () => apiFetch<{ beds: any[]; summary: any }>(`${BASE}/units/${unitId}/census`),
    enabled: !!unitId,
    refetchInterval: 30_000,
  });
}

export function usePatients(unitId: string | null) {
  return useQuery({
    queryKey: ['patients', unitId],
    queryFn: () => apiFetch<{ data: Patient[] }>(`${BASE}/patients?unit_id=${unitId}&limit=500`).then(r => r.data),
    enabled: !!unitId,
    staleTime: 10_000,
  });
}

export function useAlerts(unitId: string | null) {
  return useQuery({
    queryKey: ['alerts', unitId],
    queryFn: () => apiFetch<{ data: Alert[] }>(`${BASE}/alerts?unit_id=${unitId}&status=active`).then(r => r.data),
    enabled: !!unitId,
    refetchInterval: 15_000,
  });
}

export function useStaff(unitId: string | null) {
  return useQuery({
    queryKey: ['staff', unitId],
    queryFn: () => apiFetch<{ data: any[] }>(`${BASE}/staff?unit_id=${unitId}`).then(r => r.data),
    enabled: !!unitId,
    staleTime: 30_000,
  });
}

export function useAdmitPatient() {
  const qc = useQueryClient();
  const { upsertPatient, setBed } = useUnitStore();

  return useMutation({
    mutationFn: async ({ patientId, etag, body }: { patientId: string; etag: string; body: object }) => {
      const res = await fetch(`${BASE}/patients/${patientId}/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json();
        throw Object.assign(new Error('conflict'), { status: 409, ...data });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: (data) => {
      upsertPatient(data.patient);
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['census'] });
    },
  });
}

export function useDischargePatient() {
  const qc = useQueryClient();
  const { upsertPatient } = useUnitStore();

  return useMutation({
    mutationFn: async ({ patientId, etag, body }: { patientId: string; etag: string; body: object }) => {
      const res = await fetch(`${BASE}/patients/${patientId}/discharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json();
        throw Object.assign(new Error('conflict'), { status: 409, ...data });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['census'] });
    },
  });
}

export function useAcknowledgeAlert() {
  const { acknowledgeAlertOptimistic, acknowledgeAlertRollback, confirmAlertAck } = useUnitStore();

  return useMutation({
    mutationFn: async ({ alertId, acknowledgedBy }: { alertId: string; acknowledgedBy: string }) => {
      acknowledgeAlertOptimistic(alertId);
      const res = await fetch(`${BASE}/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged_by: acknowledgedBy }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { alertId, acknowledgedBy };
    },
    onSuccess: ({ alertId, acknowledgedBy }) => {
      confirmAlertAck(alertId, acknowledgedBy, new Date().toISOString());
    },
    onError: (_err, { alertId }) => {
      acknowledgeAlertRollback(alertId);
    },
  });
}
