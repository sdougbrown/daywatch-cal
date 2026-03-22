import { CalendarGrid } from '../src/grid.js';
import type { DateRange } from '../src/types.js';

const timedRange: DateRange = {
  id: 'standup',
  label: 'Standup',
  everyWeekday: [1, 2, 3, 4, 5],
  everyHour: [9],
  duration: 15,
};

const allDayRange: DateRange = {
  id: 'vacation',
  label: 'Vacation',
  fromDate: '2026-03-10',
  toDate: '2026-03-15',
  fixedBetween: true,
};

describe('CalendarGrid fidelity', () => {
  describe('year fidelity', () => {
    it('sets hasActivity=true for days with ranges', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [allDayRange],
        fidelity: 'year',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      const march10 = allDays.find(d => d.date === '2026-03-10');
      const march16 = allDays.find(d => d.date === '2026-03-16');

      expect(march10?.hasActivity).toBe(true);
      expect(march16?.hasActivity).toBe(false);
    });

    it('produces empty ranges[] for year fidelity', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [allDayRange],
        fidelity: 'year',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      const march12 = allDays.find(d => d.date === '2026-03-12');
      expect(march12?.ranges).toHaveLength(0);
    });

    it('produces empty timeSlots[] for year fidelity', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [timedRange],
        fidelity: 'year',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      // Monday March 23 — would normally have time slots
      const monday = allDays.find(d => d.date === '2026-03-23');
      expect(monday?.timeSlots).toHaveLength(0);
      expect(monday?.hasActivity).toBe(true);
    });
  });

  describe('month fidelity (default)', () => {
    it('computes ranges[] but skips timeSlots[]', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [allDayRange, timedRange],
        fidelity: 'month',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      const march12 = allDays.find(d => d.date === '2026-03-12');

      // ranges[] should be populated
      expect(march12?.ranges.length).toBeGreaterThan(0);
      // timeSlots[] should be empty for month fidelity
      expect(march12?.timeSlots).toHaveLength(0);
    });

    it('defaults to month fidelity when not specified', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [timedRange],
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      // Monday March 23
      const monday = allDays.find(d => d.date === '2026-03-23');
      // month fidelity: ranges populated, timeSlots empty
      expect(monday?.ranges).toHaveLength(1);
      expect(monday?.timeSlots).toHaveLength(0);
    });
  });

  describe('week fidelity', () => {
    it('computes both ranges[] and timeSlots[]', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [timedRange],
        fidelity: 'week',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      const monday = allDays.find(d => d.date === '2026-03-23');

      expect(monday?.ranges).toHaveLength(1);
      expect(monday?.timeSlots).toHaveLength(1);
      expect(monday?.timeSlots[0].startTime).toBe('09:00');
    });
  });

  describe('day fidelity', () => {
    it('computes both ranges[] and timeSlots[]', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [timedRange],
        fidelity: 'day',
      });

      const allDays = grid.months[0].weeks.flatMap(w => w.days);
      const monday = allDays.find(d => d.date === '2026-03-23');

      expect(monday?.ranges).toHaveLength(1);
      expect(monday?.timeSlots).toHaveLength(1);
      expect(monday?.timeSlots[0].startTime).toBe('09:00');
    });
  });

  it('does not set hasActivity for non-year fidelity', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [allDayRange],
      fidelity: 'month',
    });

    const allDays = grid.months[0].weeks.flatMap(w => w.days);
    const march12 = allDays.find(d => d.date === '2026-03-12');
    expect(march12?.hasActivity).toBeUndefined();
  });
});
