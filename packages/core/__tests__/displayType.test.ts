import { resolveDisplayType } from '../src/displayType.js';
import { RangeEvaluator } from '../src/evaluator.js';
import { CalendarGrid } from '../src/grid.js';
import type { DateRange } from '../src/types.js';

describe('resolveDisplayType', () => {
  it('returns explicit displayType as-is (not auto)', () => {
    const range: DateRange = { id: 'r1', label: 'R1', displayType: 'span' };
    expect(resolveDisplayType(range, 'month')).toBe('span');
    expect(resolveDisplayType(range, 'year')).toBe('span');
    expect(resolveDisplayType(range, 'day')).toBe('span');
  });

  it('returns dot for year fidelity regardless of range type', () => {
    const range: DateRange = {
      id: 'r1',
      label: 'R1',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    };
    expect(resolveDisplayType(range, 'year')).toBe('dot');
  });

  it('returns chip for timed range at month fidelity (everyHour)', () => {
    const range: DateRange = { id: 'r1', label: 'R1', everyHour: [9] };
    expect(resolveDisplayType(range, 'month')).toBe('chip');
  });

  it('returns block for timed range at week/day fidelity (everyHour)', () => {
    const range: DateRange = { id: 'r1', label: 'R1', everyHour: [9] };
    expect(resolveDisplayType(range, 'week')).toBe('block');
    expect(resolveDisplayType(range, 'day')).toBe('block');
  });

  it('returns chip for timed range at month fidelity (startTime)', () => {
    const range: DateRange = { id: 'r1', label: 'R1', startTime: '09:00', endTime: '10:00' };
    expect(resolveDisplayType(range, 'month')).toBe('chip');
  });

  it('returns block for timed range at day fidelity (startTime)', () => {
    const range: DateRange = { id: 'r1', label: 'R1', startTime: '09:00', endTime: '10:00' };
    expect(resolveDisplayType(range, 'day')).toBe('block');
  });

  it('returns span for fromDate+toDate range at month fidelity', () => {
    const range: DateRange = {
      id: 'r1',
      label: 'R1',
      fromDate: '2026-03-01',
      toDate: '2026-03-15',
    };
    expect(resolveDisplayType(range, 'month')).toBe('span');
  });

  it('returns dot for single-date range', () => {
    const range: DateRange = { id: 'r1', label: 'R1', dates: ['2026-03-15'] };
    expect(resolveDisplayType(range, 'month')).toBe('dot');
  });

  it('returns fill for range with no specific characteristics', () => {
    const range: DateRange = { id: 'r1', label: 'R1', everyWeekday: [1, 3, 5] };
    expect(resolveDisplayType(range, 'month')).toBe('fill');
  });

  it('auto resolves when displayType is auto', () => {
    const range: DateRange = { id: 'r1', label: 'R1', displayType: 'auto', everyHour: [9] };
    expect(resolveDisplayType(range, 'month')).toBe('chip');
  });

  it('auto resolves when displayType is undefined', () => {
    const range: DateRange = { id: 'r1', label: 'R1', everyHour: [9] };
    expect(resolveDisplayType(range, 'month')).toBe('chip');
  });
});

describe('displayType pass-through', () => {
  describe('in DayRangeInfo (via CalendarGrid)', () => {
    it('passes displayType through to ranges[]', () => {
      const range: DateRange = {
        id: 'vacation',
        label: 'Vacation',
        fromDate: '2026-03-10',
        toDate: '2026-03-15',
        fixedBetween: true,
        displayType: 'span',
      };

      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [range],
        fidelity: 'month',
      });

      const allDays = grid.months[0].weeks.flatMap((w) => w.days);
      const march12 = allDays.find((d) => d.date === '2026-03-12');

      expect(march12?.ranges[0].displayType).toBe('span');
    });

    it('does not set displayType when range has none', () => {
      const range: DateRange = {
        id: 'vacation',
        label: 'Vacation',
        fromDate: '2026-03-10',
        toDate: '2026-03-15',
        fixedBetween: true,
      };

      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [range],
        fidelity: 'month',
      });

      const allDays = grid.months[0].weeks.flatMap((w) => w.days);
      const march12 = allDays.find((d) => d.date === '2026-03-12');

      expect(march12?.ranges[0].displayType).toBeUndefined();
    });
  });

  describe('in Occurrence (via RangeEvaluator.expand)', () => {
    it('passes displayType through to occurrences', () => {
      const range: DateRange = {
        id: 'meeting',
        label: 'Meeting',
        dates: ['2026-03-10'],
        everyHour: [9],
        duration: 60,
        displayType: 'chip',
      };

      const evaluator = new RangeEvaluator();
      const occurrences = evaluator.expand(range, new Date(2026, 2, 1), new Date(2026, 2, 31));

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].displayType).toBe('chip');
    });

    it('passes displayType through for all-day occurrences', () => {
      const range: DateRange = {
        id: 'vacation',
        label: 'Vacation',
        dates: ['2026-03-10'],
        displayType: 'fill',
      };

      const evaluator = new RangeEvaluator();
      const occurrences = evaluator.expand(range, new Date(2026, 2, 1), new Date(2026, 2, 31));

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].displayType).toBe('fill');
    });

    it('does not set displayType when range has none', () => {
      const range: DateRange = {
        id: 'vacation',
        label: 'Vacation',
        dates: ['2026-03-10'],
      };

      const evaluator = new RangeEvaluator();
      const occurrences = evaluator.expand(range, new Date(2026, 2, 1), new Date(2026, 2, 31));

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0].displayType).toBeUndefined();
    });
  });
});
