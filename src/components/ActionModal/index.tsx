// src/components/ActionModal/index.tsx
import React, { useState, useEffect } from 'react';
import type { Patient, Bed } from '../../types';
import { useAdmitPatient, useDischargePatient } from '../../hooks/useApi';

interface ActionModalProps {
  patient: Patient | null;
  availableBeds: Bed[];
  onClose: () => void;
}

export function ActionModal({ patient, availableBeds, onClose }: ActionModalProps) {
  const [mode, setMode] = useState<'admit' | 'discharge' | 'transfer'>('admit');
  const [bedId, setBedId] = useState('');
  const [acuity, setAcuity] = useState<number>(3);
  const [complaint, setComplaint] = useState('');
  const [disposition, setDisposition] = useState('home');
  const [conflictError, setConflictError] = useState<string | null>(null);

  const admitMutation = useAdmitPatient();
  const dischargeMutation = useDischargePatient();

  useEffect(() => {
    if (patient) {
      setAcuity(patient.acuity);
      setComplaint(patient.chief_complaint);
    }
  }, [patient]);

  if (!patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConflictError(null);

    if (mode === 'admit') {
      admitMutation.mutate(
        { patientId: patient.id, etag: patient.etag, body: { bed_id: bedId, unit_id: patient.unit_id, admitting_provider_id: patient.attending_provider_id, acuity, chief_complaint: complaint } },
        {
          onSuccess: () => onClose(),
          onError: (err: any) => {
            if (err.status === 409) setConflictError('Record was modified by another user. Please refresh and retry.');
            else setConflictError(err.message);
          }
        }
      );
    } else if (mode === 'discharge') {
      dischargeMutation.mutate(
        { patientId: patient.id, etag: patient.etag, body: { disposition, discharge_notes: '' } },
        {
          onSuccess: () => onClose(),
          onError: (err: any) => {
            if (err.status === 409) setConflictError('Conflict: another user modified this patient. Refresh and retry.');
            else setConflictError(err.message);
          }
        }
      );
    }
  };

  const isLoading = admitMutation.isPending || dischargeMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={`Patient action: ${patient.first_name} ${patient.last_name}`}
    >
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4 border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div>
            <h2 className="text-slate-100 font-semibold">{patient.last_name}, {patient.first_name}</h2>
            <p className="text-xs text-slate-400 font-mono">{patient.mrn} · Acuity {patient.acuity}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl" aria-label="Close modal">✕</button>
        </div>

        {/* Mode selector */}
        <div className="flex border-b border-slate-700">
          {(['admit','discharge','transfer'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-xs font-mono uppercase tracking-wide ${mode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {mode === 'admit' && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Target Bed</label>
                <select
                  value={bedId}
                  onChange={e => setBedId(e.target.value)}
                  required
                  className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600"
                >
                  <option value="">Select bed…</option>
                  {availableBeds.filter(b => b.status === 'available').map(b => (
                    <option key={b.id} value={b.id}>{b.room}{b.bed_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Acuity (1–5)</label>
                <input
                  type="number" min={1} max={5} value={acuity}
                  onChange={e => setAcuity(parseInt(e.target.value))}
                  className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Chief Complaint</label>
                <input
                  value={complaint}
                  onChange={e => setComplaint(e.target.value)}
                  required
                  className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600"
                />
              </div>
            </>
          )}

          {mode === 'discharge' && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Disposition</label>
              <select
                value={disposition}
                onChange={e => setDisposition(e.target.value)}
                className="w-full bg-slate-700 text-slate-200 text-sm rounded px-2 py-1.5 border border-slate-600"
              >
                <option value="home">Home</option>
                <option value="snf">Skilled Nursing Facility</option>
                <option value="rehab">Rehab</option>
                <option value="ama">AMA</option>
                <option value="transfer">Transfer to another facility</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          )}

          {mode === 'transfer' && (
            <div className="text-sm text-slate-400">Transfer form: select target unit and bed.</div>
          )}

          {conflictError && (
            <div
              role="alert"
              className="bg-red-900/40 border border-red-700 rounded p-2 text-xs text-red-300"
            >
              ⚠ {conflictError}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-slate-700 text-slate-300 text-sm rounded hover:bg-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded font-medium"
            >
              {isLoading ? 'Processing…' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
