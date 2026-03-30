import { jest } from '@jest/globals';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useTimeSelection } from '../src/useTimeSelection.js';

describe('useTimeSelection', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onSelectionChange with snapped times on click', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useTimeSelection({
        date: '2026-03-10',
        selection: { date: '2026-03-10', startTime: null, endTime: null, preview: null },
        onSelectionChange,
        intervalMinutes: 15,
      }),
    );

    act(() => {
      result.current.onTimeClick('14:17');
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      date: '2026-03-10',
      startTime: '14:15',
      endTime: null,
      preview: null,
    });
  });

  it('updates preview on hover', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useTimeSelection({
        date: '2026-03-10',
        selection: { date: '2026-03-10', startTime: '14:00', endTime: null, preview: null },
        onSelectionChange,
        intervalMinutes: 15,
      }),
    );

    act(() => {
      result.current.onTimeHover('14:17');
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      date: '2026-03-10',
      startTime: '14:00',
      endTime: null,
      preview: '14:15',
    });
  });

  it('preserves date when clearing the selection', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useTimeSelection({
        date: '2026-03-10',
        selection: { date: '2026-03-10', startTime: '14:00', endTime: '15:00', preview: '14:30' },
        onSelectionChange,
      }),
    );

    act(() => {
      result.current.clear();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      date: '2026-03-10',
      startTime: null,
      endTime: null,
      preview: null,
    });
  });

  it('respects intervalMinutes snapping in the controlled callback flow', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useTimeSelection({
        date: '2026-03-10',
        selection: { date: '2026-03-10', startTime: null, endTime: null, preview: null },
        onSelectionChange,
        intervalMinutes: 30,
      }),
    );

    act(() => {
      result.current.onTimeClick('09:50');
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      date: '2026-03-10',
      startTime: '09:30',
      endTime: null,
      preview: null,
    });
  });
});
