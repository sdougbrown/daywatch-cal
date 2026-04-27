import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { vi } from 'vitest';
import { useCalendar } from '../src/useCalendar.js';

describe('useCalendar', () => {
  let container: HTMLDivElement;

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('exposes the same controlled calendar behavior in Preact', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const onFocusDateChange = vi.fn();
    let latestResult: ReturnType<typeof useCalendar> | undefined;

    function Harness(props: { focusDate: string }) {
      latestResult = useCalendar({
        focusDate: props.focusDate,
        onFocusDateChange,
        numberOfMonths: 1,
        ranges: [],
        fidelity: 'month',
      });
      return h('div', null);
    }

    act(() => {
      render(h(Harness, { focusDate: '2026-03-31' }), container);
    });

    expect(latestResult?.focusDate).toBe('2026-03-31');
    expect(latestResult?.months[0]?.month).toBe(2);

    act(() => {
      latestResult?.next();
      latestResult?.prev();
      latestResult?.goTo('2026-12-25');
    });

    expect(onFocusDateChange).toHaveBeenNthCalledWith(1, '2026-04-30');
    expect(onFocusDateChange).toHaveBeenNthCalledWith(2, '2026-02-28');
    expect(onFocusDateChange).toHaveBeenNthCalledWith(3, '2026-12-25');

    act(() => {
      render(h(Harness, { focusDate: '2026-07-01' }), container);
    });

    expect(latestResult?.focusDate).toBe('2026-07-01');
    expect(latestResult?.months[0]?.month).toBe(6);
  });
});
