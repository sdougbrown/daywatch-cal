import { vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useCalendar } from '../src/useCalendar.js';

describe('useCalendar', () => {
  afterEach(() => {
    cleanup();
  });

  it('recomputes from the controlled focusDate prop', () => {
    const onFocusDateChange = vi.fn();
    const { result, rerender } = renderHook(
      ({
        focusDate,
        onFocusDateChange,
      }: {
        focusDate: string;
        onFocusDateChange: (date: string) => void;
      }) =>
        useCalendar({
          focusDate,
          onFocusDateChange,
          numberOfMonths: 1,
          ranges: [],
          fidelity: 'month',
        }),
      {
        initialProps: {
          focusDate: '2026-03-15',
          onFocusDateChange,
        },
      },
    );

    expect(result.current.focusDate).toBe('2026-03-15');
    expect(result.current.months[0]?.month).toBe(2);

    rerender({
      focusDate: '2026-07-01',
      onFocusDateChange,
    });

    expect(result.current.focusDate).toBe('2026-07-01');
    expect(result.current.months[0]?.month).toBe(6);
  });

  it('reports navigation changes through onFocusDateChange', () => {
    const onFocusDateChange = vi.fn();
    const { result } = renderHook(() =>
      useCalendar({
        focusDate: '2026-03-31',
        onFocusDateChange,
        numberOfMonths: 1,
        ranges: [],
        fidelity: 'month',
      }),
    );

    act(() => {
      result.current.next();
      result.current.prev();
      result.current.goTo('2026-12-25');
    });

    expect(onFocusDateChange).toHaveBeenNthCalledWith(1, '2026-04-30');
    expect(onFocusDateChange).toHaveBeenNthCalledWith(2, '2026-02-28');
    expect(onFocusDateChange).toHaveBeenNthCalledWith(3, '2026-12-25');
  });
});
