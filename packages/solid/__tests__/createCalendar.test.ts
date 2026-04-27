import { createRoot, createSignal } from 'solid-js';
import { createCalendar } from '../src/createCalendar.js';

describe('createCalendar', () => {
  it('reacts to controlled focus-date changes and navigation', () => {
    createRoot((dispose) => {
      const [focusDate, setFocusDate] = createSignal('2026-03-31');

      const calendar = createCalendar(() => ({
        focusDate: focusDate(),
        onFocusDateChange: setFocusDate,
        numberOfMonths: 1,
        ranges: [],
        fidelity: 'month',
      }));

      expect(calendar.focusDate()).toBe('2026-03-31');
      expect(calendar.months()[0]?.month).toBe(2);

      calendar.next();
      expect(focusDate()).toBe('2026-04-30');

      calendar.goTo('2026-07-01');
      expect(calendar.focusDate()).toBe('2026-07-01');
      expect(calendar.months()[0]?.month).toBe(6);

      dispose();
    });
  });
});
