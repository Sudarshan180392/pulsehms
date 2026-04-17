// src/hooks/usePatientWorker.ts
import { useEffect, useRef, useCallback } from 'react';
import { useUnitStore } from '../store';
import type { WorkerInMessage, WorkerOutMessage, Patient, FilterState, SortState } from '../types';

export function usePatientWorker() {
  const workerRef = useRef<Worker | null>(null);
  const { setFilteredIndices } = useUnitStore();

  useEffect(() => {
    const worker = new Worker(new URL('../workers/patientWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'RESULT') {
        setFilteredIndices(msg.payload.indices, msg.payload.stats);
      }
    };

    return () => { worker.terminate(); workerRef.current = null; };
  }, [setFilteredIndices]);

  const loadPatients = useCallback((patients: Patient[]) => {
    workerRef.current?.postMessage({ type: 'LOAD', payload: patients } satisfies WorkerInMessage);
  }, []);

  const applyFilter = useCallback((filters: FilterState) => {
    workerRef.current?.postMessage({ type: 'FILTER', payload: filters } satisfies WorkerInMessage);
  }, []);

  const applySort = useCallback((sort: SortState) => {
    workerRef.current?.postMessage({ type: 'SORT', payload: sort } satisfies WorkerInMessage);
  }, []);

  const computeHandoffList = useCallback(() => {
    workerRef.current?.postMessage({ type: 'COMPUTE_HANDOFF_LIST', payload: {} } satisfies WorkerInMessage);
  }, []);

  return { loadPatients, applyFilter, applySort, computeHandoffList };
}
