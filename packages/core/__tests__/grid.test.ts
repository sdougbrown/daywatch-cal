import { CalendarGrid } from '../src/grid.js';
import type { DateRange } from '../src/types.js';

describe('CalendarGrid', () => {
  it('generates correct number of months', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 3,
      ranges: [],
    });

    expect(grid.months).toHaveLength(3);
    expect(grid.months[0].label).toContain('March');
    expect(grid.months[1].label).toContain('April');
    expect(grid.months[2].label).toContain('May');
  });

  it('generates weeks with 7 days each', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [],
    });

    for (const week of grid.months[0].weeks) {
      expect(week.days).toHaveLength(7);
    }
  });

  it('marks current month days correctly', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [],
    });

    const allDays = grid.months[0].weeks.flatMap(w => w.days);
    const marchDays = allDays.filter(d => d.isCurrentMonth);

    // March 2026 has 31 days
    expect(marchDays).toHaveLength(31);
    expect(marchDays[0].dayOfMonth).toBe(1);
    expect(marchDays[marchDays.length - 1].dayOfMonth).toBe(31);
  });

  it('pads with previous/next month days', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [],
      weekStartsOn: 0, // Sunday
    });

    const firstWeek = grid.months[0].weeks[0];
    // March 1, 2026 is a Sunday, so no leading padding needed with weekStartsOn=0
    expect(firstWeek.days[0].isCurrentMonth).toBe(true);
    expect(firstWeek.days[0].dayOfMonth).toBe(1);
  });

  it('respects weekStartsOn=1 (Monday)', () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [],
      weekStartsOn: 1,
    });

    // With Monday start, March 1 2026 (Sunday) should be at the end of the first week,
    // with leading days from February
    const firstWeek = grid.months[0].weeks[0];
    // The first day should be a Monday
    const firstDay = firstWeek.days[0];
    const firstDate = new Date(
      parseInt(firstDay.date.split('-')[0]),
      parseInt(firstDay.date.split('-')[1]) - 1,
      parseInt(firstDay.date.split('-')[2]),
    );
    expect(firstDate.getDay()).toBe(1); // Monday
  });

  it('evaluates ranges for each day', () => {
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
    });

    const allDays = grid.months[0].weeks.flatMap(w => w.days);
    const march10 = allDays.find(d => d.date === '2026-03-10');
    const march12 = allDays.find(d => d.date === '2026-03-12');
    const march15 = allDays.find(d => d.date === '2026-03-15');
    const march16 = allDays.find(d => d.date === '2026-03-16');

    expect(march10?.ranges).toHaveLength(1);
    expect(march10?.ranges[0].isStart).toBe(true);
    expect(march12?.ranges[0].isContinuation).toBe(true);
    expect(march15?.ranges[0].isEnd).toBe(true);
    expect(march16?.ranges).toHaveLength(0);
  });

  describe('navigation', () => {
    it('next() advances by one month', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [],
      });

      grid.next();
      expect(grid.getFocusDate()).toBe('2026-04-15');
      expect(grid.months[0].label).toContain('April');
    });

    it('prev() goes back one month', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [],
      });

      grid.prev();
      expect(grid.getFocusDate()).toBe('2026-02-15');
      expect(grid.months[0].label).toContain('February');
    });

    it('goTo() jumps to a specific date', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [],
      });

      grid.goTo('2026-07-01');
      expect(grid.getFocusDate()).toBe('2026-07-01');
      expect(grid.months[0].label).toContain('July');
    });

    it('prev() from March 31 clamps to Feb 28', () => {
      const grid = new CalendarGrid({
        focusDate: '2026-03-31',
        numberOfMonths: 1,
        ranges: [],
      });

      grid.prev();
      expect(grid.getFocusDate()).toBe('2026-02-28');
    });
  });

  it('generates time slots for timed ranges at week/day fidelity', () => {
    const range: DateRange = {
      id: 'standup',
      label: 'Standup',
      everyWeekday: [1, 2, 3, 4, 5],
      everyHour: [9],
      duration: 15,
    };

    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 1,
      ranges: [range],
      fidelity: 'week',
    });

    const allDays = grid.months[0].weeks.flatMap(w => w.days);
    // Monday March 23
    const monday = allDays.find(d => d.date === '2026-03-23');
    expect(monday?.timeSlots).toHaveLength(1);
    expect(monday?.timeSlots[0].startTime).toBe('09:00');

    // Saturday March 21
    const saturday = allDays.find(d => d.date === '2026-03-21');
    expect(saturday?.timeSlots).toHaveLength(0);
  });
});
