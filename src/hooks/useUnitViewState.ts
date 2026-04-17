// src/hooks/useUnitViewState.ts
import { useEffect, useCallback, useRef } from 'react';
import { openDB, type IDBPDatabase } from 'idb';
import { useUnitStore } from '../store';
import type { FilterState, SortState, ViewState } from '../types';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../types';

const DB_NAME = 'pulseops-views';
const STORE_NAME = 'saved-views';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) { db.createObjectStore(STORE_NAME); }
    });
  }
  return dbPromise;
}

// ─── URL Serialization ────────────────────────────────────────────────────

function encodeViewState(view: Partial<ViewState>): string {
  const params = new URLSearchParams();
  if (view.selectedUnitId) params.set('unit', view.selectedUnitId);
  if (view.activePanel) params.set('panel', view.activePanel);
  if (view.zoomLevel !== undefined) params.set('zoom', String(view.zoomLevel));
  if (view.filters) params.set('filters', JSON.stringify(view.filters));
  if (view.sort) params.set('sort', JSON.stringify(view.sort));
  if (view.expandedPanels?.length) params.set('expanded', view.expandedPanels.join(','));
  return params.toString();
}

function decodeViewState(search: string): Partial<ViewState> {
  const params = new URLSearchParams(search);
  const result: Partial<ViewState> = {};
  const unit = params.get('unit');
  if (unit) result.selectedUnitId = unit;
  const panel = params.get('panel');
  if (panel) result.activePanel = panel as ViewState['activePanel'];
  const zoom = params.get('zoom');
  if (zoom) result.zoomLevel = parseFloat(zoom) || 1;
  const filtersRaw = params.get('filters');
  if (filtersRaw) {
    try { result.filters = { ...DEFAULT_FILTERS, ...JSON.parse(filtersRaw) }; } catch { /* invalid JSON */ }
  }
  const sortRaw = params.get('sort');
  if (sortRaw) {
    try { result.sort = { ...DEFAULT_SORT, ...JSON.parse(sortRaw) }; } catch { /* invalid JSON */ }
  }
  const expanded = params.get('expanded');
  if (expanded) result.expandedPanels = expanded.split(',').filter(Boolean);
  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useUnitViewState() {
  const store = useUnitStore();
  const pushingRef = useRef(false);

  // On mount: restore state from URL
  useEffect(() => {
    const decoded = decodeViewState(window.location.search);
    if (decoded.selectedUnitId) store.setSelectedUnit(decoded.selectedUnitId);
    if (decoded.activePanel) store.setActivePanel(decoded.activePanel);
    if (decoded.zoomLevel) store.setZoom(decoded.zoomLevel);
    if (decoded.filters) store.setFilters(decoded.filters);
    if (decoded.sort) store.setSort(decoded.sort);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Push to URL when state changes
  useEffect(() => {
    if (pushingRef.current) return;
    const encoded = encodeViewState({
      selectedUnitId: store.selectedUnitId ?? undefined,
      activePanel: store.activePanel,
      zoomLevel: store.zoomLevel,
      filters: store.filters,
      sort: store.sort,
    });
    const newUrl = encoded ? `${window.location.pathname}?${encoded}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [store.selectedUnitId, store.activePanel, store.zoomLevel, store.filters, store.sort]);

  // ─── Saved Views (IndexedDB) ──────────────────────────────────────────

  const saveView = useCallback(async (name: string) => {
    const view: ViewState = {
      selectedUnitId: store.selectedUnitId,
      activePanel: store.activePanel,
      filters: store.filters,
      sort: store.sort,
      zoomLevel: store.zoomLevel,
      expandedPanels: [],
    };
    const db = await getDB();
    await db.put(STORE_NAME, view, name);
  }, [store]);

  const loadView = useCallback(async (name: string): Promise<boolean> => {
    const db = await getDB();
    const view: ViewState | undefined = await db.get(STORE_NAME, name);
    if (!view) return false;
    if (view.selectedUnitId !== undefined) store.setSelectedUnit(view.selectedUnitId);
    if (view.activePanel) store.setActivePanel(view.activePanel);
    if (view.filters) store.setFilters(view.filters);
    if (view.sort) store.setSort(view.sort);
    if (view.zoomLevel) store.setZoom(view.zoomLevel);
    return true;
  }, [store]);

  const listViews = useCallback(async (): Promise<string[]> => {
    const db = await getDB();
    return (await db.getAllKeys(STORE_NAME)) as string[];
  }, []);

  const deleteView = useCallback(async (name: string) => {
    const db = await getDB();
    await db.delete(STORE_NAME, name);
  }, []);

  return { saveView, loadView, listViews, deleteView, encodeViewState, decodeViewState };
}
