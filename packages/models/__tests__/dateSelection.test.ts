import { vi } from 'vitest';
import {
  createIsDateBlocked,
  selectionToDateRange,
  updateDateSelection,
} from '../src/index.js';

describe('date selection helpers', () => {
  it('sets start on the first click', () => {
    const selection = updateDateSelection(
      { start: null, end: null, preview: null },
      { type: 'click', date: '2026-03-10' },
    );

    expect(selection).toEqual({
      start: '2026-03-10',
      end: null,
      preview: null,
    });
  });

  it('sets end on the second click', () => {
    const selection = updateDateSelection(
      { start: '2026-03-10', end: null, preview: '2026-03-12' },
      { type: 'click', date: '2026-03-12' },
    );

    expect(selection).toEqual({
      start: '2026-03-10',
      end: '2026-03-12',
      preview: null,
    });
  });

  it('swaps start and end when the second click is earlier than the first', () => {
    const selection = updateDateSelection(
      { start: '2026-03-12', end: null, preview: null },
      { type: 'click', date: '2026-03-10' },
    );

    expect(selection).toEqual({
      start: '2026-03-10',
      end: '2026-03-12',
      preview: null,
    });
  });

  it('resets and starts a new selection on the third click by default', () => {
    const selection = updateDateSelection(
      { start: '2026-03-10', end: '2026-03-12', preview: null },
      { type: 'click', date: '2026-03-20' },
      { resetOnThirdClick: true },
    );

    expect(selection).toEqual({
      start: '2026-03-20',
      end: null,
      preview: null,
    });
  });

  it('treats the third click as a no-op when resetOnThirdClick is false', () => {
    const selection = { start: '2026-03-10', end: '2026-03-12', preview: null };
    const next = updateDateSelection(
      selection,
      { type: 'click', date: '2026-03-20' },
      { resetOnThirdClick: false },
    );

    expect(next).toBe(selection);
  });

  it('blocks same-day end selection when allowSameDay is false', () => {
    const selection = { start: '2026-03-10', end: null, preview: null };
    const next = updateDateSelection(
      selection,
      { type: 'click', date: '2026-03-10' },
      { allowSameDay: false },
    );

    expect(next).toBe(selection);
  });

  it('allows same-day ranges by default', () => {
    const selection = updateDateSelection(
      { start: '2026-03-10', end: null, preview: null },
      { type: 'click', date: '2026-03-10' },
    );

    expect(selection).toEqual({
      start: '2026-03-10',
      end: '2026-03-10',
      preview: null,
    });
  });

  it('blocks clicks for unselectable dates', () => {
    const selection = { start: null, end: null, preview: null };
    const next = updateDateSelection(
      selection,
      { type: 'click', date: '2026-03-10' },
      { isDateSelectable: () => false },
    );

    expect(next).toBe(selection);
  });

  it('blocks hover for unselectable dates', () => {
    const selection = { start: '2026-03-10', end: null, preview: null };
    const next = updateDateSelection(
      selection,
      { type: 'hover', date: '2026-03-11' },
      { isDateSelectable: () => false },
    );

    expect(next).toBe(selection);
  });

  it('sets preview only while a range is being selected', () => {
    const selection = updateDateSelection(
      { start: '2026-03-10', end: null, preview: null },
      { type: 'hover', date: '2026-03-12' },
    );

    expect(selection).toEqual({
      start: '2026-03-10',
      end: null,
      preview: '2026-03-12',
    });
  });

  it('treats hover as a no-op before a start date is selected', () => {
    const selection = { start: null, end: null, preview: null };
    const next = updateDateSelection(selection, { type: 'hover', date: '2026-03-12' });

    expect(next).toBe(selection);
  });

  it('treats hover as a no-op after the selection is complete', () => {
    const selection = { start: '2026-03-10', end: '2026-03-12', preview: null };
    const next = updateDateSelection(selection, { type: 'hover', date: '2026-03-15' });

    expect(next).toBe(selection);
  });

  it('clears the selection to all null fields', () => {
    const selection = updateDateSelection(
      { start: '2026-03-10', end: '2026-03-12', preview: '2026-03-11' },
      { type: 'clear' },
    );

    expect(selection).toEqual({
      start: null,
      end: null,
      preview: null,
    });
  });

  it('returns the same reference for unchanged actions', () => {
    const selection = { start: null, end: null, preview: null };
    const next = updateDateSelection(selection, { type: 'clear' });

    expect(next).toBe(selection);
  });

  it('reports blocked dates that fall within the provided ranges', () => {
    const isBlocked = createIsDateBlocked([
      {
        id: 'vacation',
        label: 'Vacation',
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
      },
    ]);

    expect(isBlocked('2026-03-11')).toBe(true);
  });

  it('returns false for dates outside the provided ranges', () => {
    const isBlocked = createIsDateBlocked([
      {
        id: 'vacation',
        label: 'Vacation',
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
      },
    ]);

    expect(isBlocked('2026-03-15')).toBe(false);
  });

  it('returns null for incomplete selections when converting to a DateRange', () => {
    expect(selectionToDateRange({ start: '2026-03-10', end: null, preview: null })).toBeNull();
  });

  it('converts a complete selection to a DateRange', () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const range = selectionToDateRange({
      start: '2026-03-10',
      end: '2026-03-12',
      preview: null,
    });

    expect(range).toEqual({
      id: 'selection-1234567890',
      label: '',
      fromDate: '2026-03-10',
      toDate: '2026-03-12',
    });

    dateNowSpy.mockRestore();
  });

  it('merges template fields when converting to a DateRange', () => {
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const range = selectionToDateRange(
      {
        start: '2026-03-10',
        end: '2026-03-12',
        preview: null,
      },
      {
        label: 'Selected block',
        timezone: 'UTC',
        startTime: '09:00',
        endTime: '17:00',
      },
    );

    expect(range).toEqual({
      id: 'selection-1234567890',
      label: 'Selected block',
      fromDate: '2026-03-10',
      toDate: '2026-03-12',
      timezone: 'UTC',
      startTime: '09:00',
      endTime: '17:00',
    });

    dateNowSpy.mockRestore();
  });
});
