// src/tests/useUnitViewState.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { ViewState, FilterState, SortState } from '../types';
import { DEFAULT_FILTERS, DEFAULT_SORT } from '../types';

// ─── Replicate encode/decode for unit testing ─────────────────────────────

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
    try { result.filters = { ...DEFAULT_FILTERS, ...JSON.parse(filtersRaw) }; } catch { /* */ }
  }
  const sortRaw = params.get('sort');
  if (sortRaw) {
    try { result.sort = { ...DEFAULT_SORT, ...JSON.parse(sortRaw) }; } catch { /* */ }
  }
  const expanded = params.get('expanded');
  if (expanded) result.expandedPanels = expanded.split(',').filter(Boolean);
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('URL state serialization round-trips', () => {
  it('encodes and decodes selectedUnitId', () => {
    const encoded = encodeViewState({ selectedUnitId: 'unit-3' });
    const decoded = decodeViewState(encoded);
    expect(decoded.selectedUnitId).toBe('unit-3');
  });

  it('encodes and decodes activePanel', () => {
    const encoded = encodeViewState({ activePanel: 'bedmap' });
    const decoded = decodeViewState(encoded);
    expect(decoded.activePanel).toBe('bedmap');
  });

  it('encodes and decodes zoomLevel', () => {
    const encoded = encodeViewState({ zoomLevel: 1.75 });
    const decoded = decodeViewState(encoded);
    expect(decoded.zoomLevel).toBeCloseTo(1.75);
  });

  it('encodes and decodes filters with empty arrays', () => {
    const filters: FilterState = { ...DEFAULT_FILTERS, status: [], unit_ids: [], fall_risk: [] };
    const encoded = encodeViewState({ filters });
    const decoded = decodeViewState(encoded);
    expect(decoded.filters?.status).toEqual([]);
    expect(decoded.filters?.unit_ids).toEqual([]);
  });

  it('encodes and decodes filters with values', () => {
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      status: ['admitted', 'pending'],
      acuityMin: 2,
      acuityMax: 4,
      search: 'Smith',
    };
    const encoded = encodeViewState({ filters });
    const decoded = decodeViewState(encoded);
    expect(decoded.filters?.status).toEqual(['admitted', 'pending']);
    expect(decoded.filters?.acuityMin).toBe(2);
    expect(decoded.filters?.acuityMax).toBe(4);
    expect(decoded.filters?.search).toBe('Smith');
  });

  it('encodes and decodes sort configuration', () => {
    const sort: SortState = { columns: [{ key: 'los_hours', dir: 'desc' }, { key: 'acuity', dir: 'asc' }] };
    const encoded = encodeViewState({ sort });
    const decoded = decodeViewState(encoded);
    expect(decoded.sort?.columns).toHaveLength(2);
    expect(decoded.sort?.columns[0].key).toBe('los_hours');
    expect(decoded.sort?.columns[0].dir).toBe('desc');
  });

  it('handles unit IDs with special characters', () => {
    const encoded = encodeViewState({ selectedUnitId: 'unit-3-north+cardiac' });
    const decoded = decodeViewState(encoded);
    expect(decoded.selectedUnitId).toBe('unit-3-north+cardiac');
  });

  it('handles null optional fields gracefully', () => {
    const filters: FilterState = { ...DEFAULT_FILTERS, los_threshold_hours: null, has_flags: null };
    const encoded = encodeViewState({ filters });
    const decoded = decodeViewState(encoded);
    expect(decoded.filters?.los_threshold_hours).toBeNull();
    expect(decoded.filters?.has_flags).toBeNull();
  });

  it('encodes and decodes expandedPanels', () => {
    const encoded = encodeViewState({ expandedPanels: ['alerts', 'census'] });
    const decoded = decodeViewState(encoded);
    expect(decoded.expandedPanels).toEqual(['alerts', 'census']);
  });

  it('handles empty expandedPanels — not included in URL', () => {
    const encoded = encodeViewState({ expandedPanels: [] });
    expect(encoded).not.toContain('expanded');
  });

  it('returns empty object for empty URL search string', () => {
    const decoded = decodeViewState('');
    expect(decoded).toEqual({});
  });

  it('round-trips full view state', () => {
    const view: Partial<ViewState> = {
      selectedUnitId: 'unit-2',
      activePanel: 'both',
      zoomLevel: 1.5,
      filters: { ...DEFAULT_FILTERS, search: 'Jones', acuityMin: 3, status: ['admitted'] },
      sort: { columns: [{ key: 'acuity', dir: 'desc' }] },
      expandedPanels: ['alerts'],
    };
    const encoded = encodeViewState(view);
    const decoded = decodeViewState(encoded);
    expect(decoded.selectedUnitId).toBe(view.selectedUnitId);
    expect(decoded.activePanel).toBe(view.activePanel);
    expect(decoded.zoomLevel).toBeCloseTo(view.zoomLevel!);
    expect(decoded.filters?.search).toBe('Jones');
    expect(decoded.sort?.columns[0].key).toBe('acuity');
    expect(decoded.expandedPanels).toEqual(['alerts']);
  });
});
