import { YearGrid } from '../src/yearGrid.js';
import type { DateRange } from '../src/types.js';

describe('YearGrid', () => {
  it('generates 12 months', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    expect(grid.months).toHaveLength(12);
  });

  it('has correct month labels', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    expect(grid.months[0].label).toBe('January');
    expect(grid.months[2].label).toBe('March');
    expect(grid.months[11].label).toBe('December');
  });

  it('has correct totalDays per month', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    expect(grid.months[0].totalDays).toBe(31); // January
    expect(grid.months[1].totalDays).toBe(28); // February (non-leap)
    expect(grid.months[3].totalDays).toBe(30); // April
  });

  it('handles leap years', () => {
    const grid = new YearGrid({ year: 2024, ranges: [] });
    expect(grid.months[1].totalDays).toBe(29); // February in leap year
  });

  it('counts activeDays correctly', () => {
    const range: DateRange = {
      id: 'vacation',
      label: 'Vacation',
      fromDate: '2026-03-10',
      toDate: '2026-03-15',
      fixedBetween: true,
    };

    const grid = new YearGrid({ year: 2026, ranges: [range] });
    const march = grid.months[2]; // March is index 2

    expect(march.activeDays).toBe(6); // March 10-15 inclusive
    expect(march.month).toBe(2);
  });

  it('reports zero activeDays when no ranges match', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    for (const month of grid.months) {
      expect(month.activeDays).toBe(0);
    }
  });

  it('populates rangeIds for matching days', () => {
    const range1: DateRange = {
      id: 'meeting',
      label: 'Meeting',
      everyWeekday: [1], // Every Monday
    };
    const range2: DateRange = {
      id: 'standup',
      label: 'Standup',
      everyWeekday: [1, 3, 5], // Mon, Wed, Fri
    };

    const grid = new YearGrid({ year: 2026, ranges: [range1, range2] });
    const march = grid.months[2];

    // March 2, 2026 is a Monday
    const march2 = march.days.find(d => d.date === '2026-03-02');
    expect(march2?.rangeIds).toContain('meeting');
    expect(march2?.rangeIds).toContain('standup');
    expect(march2?.rangeCount).toBe(2);

    // March 4, 2026 is a Wednesday
    const march4 = march.days.find(d => d.date === '2026-03-04');
    expect(march4?.rangeIds).not.toContain('meeting');
    expect(march4?.rangeIds).toContain('standup');
    expect(march4?.rangeCount).toBe(1);

    // March 3, 2026 is a Tuesday
    const march3 = march.days.find(d => d.date === '2026-03-03');
    expect(march3?.rangeCount).toBe(0);
    expect(march3?.rangeIds).toHaveLength(0);
  });

  it('days have correct dayOfMonth values', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    const jan = grid.months[0];

    expect(jan.days).toHaveLength(31);
    expect(jan.days[0].dayOfMonth).toBe(1);
    expect(jan.days[30].dayOfMonth).toBe(31);
  });

  it('days have correct date strings', () => {
    const grid = new YearGrid({ year: 2026, ranges: [] });
    const jan = grid.months[0];

    expect(jan.days[0].date).toBe('2026-01-01');
    expect(jan.days[30].date).toBe('2026-01-31');
  });
});
