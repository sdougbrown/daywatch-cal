import { jest } from '@jest/globals';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useDateSelection } from '../src/useDateSelection.js';

describe('useDateSelection', () => {
  afterEach(() => {
    cleanup();
  });

  it('calls onSelectionChange with the updated selection on click', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useDateSelection({
        selection: { start: null, end: null, preview: null },
        onSelectionChange,
      }),
    );

    act(() => {
      result.current.onDateClick('2026-03-10');
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      start: '2026-03-10',
      end: null,
      preview: null,
    });
  });

  it('calls onSelectionChange with preview updates on hover', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useDateSelection({
        selection: { start: '2026-03-10', end: null, preview: null },
        onSelectionChange,
      }),
    );

    act(() => {
      result.current.onDateHover('2026-03-12');
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      start: '2026-03-10',
      end: null,
      preview: '2026-03-12',
    });
  });

  it('clears the controlled selection', () => {
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useDateSelection({
        selection: { start: '2026-03-10', end: '2026-03-12', preview: '2026-03-11' },
        onSelectionChange,
      }),
    );

    act(() => {
      result.current.clear();
    });

    expect(onSelectionChange).toHaveBeenCalledWith({
      start: null,
      end: null,
      preview: null,
    });
  });

  it('respects isDateSelectable when handling interactions', () => {
    const selection = { start: null, end: null, preview: null };
    const onSelectionChange = jest.fn();
    const { result } = renderHook(() =>
      useDateSelection({
        selection,
        onSelectionChange,
        isDateSelectable: () => false,
      }),
    );

    act(() => {
      result.current.onDateClick('2026-03-10');
    });

    expect(onSelectionChange).toHaveBeenCalledWith(selection);
  });
});
