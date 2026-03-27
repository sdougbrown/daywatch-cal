import type { DateRange } from '@neo-reckoning/core';

import { CalendarSession } from '../src/state.js';

function makeRange(id: string, label: string, overrides: Partial<DateRange> = {}): DateRange {
  return {
    id,
    label,
    dates: ['2026-03-26'],
    ...overrides,
  };
}

describe('CalendarSession', () => {
  it('loadCalendar accumulates calendars and flattens their ranges', () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar('work', [makeRange('meeting', 'Meeting')], 'ranges');
    session.loadCalendar('personal', [makeRange('gym', 'Gym')], 'ics');

    expect(session.calendars.size).toBe(2);
    expect(session.getAllRanges().map(range => range.id)).toEqual(['meeting', 'gym']);
  });

  it('getAllRanges filters by calendar id', () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar('work', [makeRange('meeting', 'Meeting')], 'ranges');
    session.loadCalendar('personal', [makeRange('gym', 'Gym')], 'ics');

    expect(session.getAllRanges(['personal'])).toEqual([makeRange('gym', 'Gym')]);
    expect(session.getAllRanges(['missing'])).toEqual([]);
  });

  it('getCalendarSummary returns capped unique labels with a has_more_labels flag', () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar(
      'work',
      [
        makeRange('planning', 'Planning'),
        makeRange('retro', 'Planning', { dates: ['2026-03-27'] }),
        makeRange('focus', 'Focus'),
        ...Array.from({ length: 31 }, (_, index) => makeRange(`label-${index}`, `Label ${index}`)),
      ],
      'ranges',
    );

    expect(session.getCalendarSummary()).toEqual([
      {
        id: 'work',
        rangeCount: 34,
        labels: ['Planning', 'Focus', ...Array.from({ length: 28 }, (_, index) => `Label ${index}`)],
        has_more_labels: true,
      },
    ]);
  });

  it('createCalendarId generates sequential default ids', () => {
    const session = new CalendarSession('UTC');

    const first = session.createCalendarId();
    session.loadCalendar(first, [makeRange('meeting', 'Meeting')], 'ranges');
    const second = session.createCalendarId();

    expect(first).toBe('calendar-1');
    expect(second).toBe('calendar-2');
  });

  it('finds, updates, removes, and adds ranges by calendar', () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar('work', [makeRange('meeting', 'Meeting')], 'ranges');
    session.loadCalendar('personal', [makeRange('gym', 'Gym')], 'ics');

    expect(session.findRangeCalendar('meeting')).toBe('work');
    expect(session.findRangeCalendar('gym')).toBe('personal');
    expect(session.findRangeCalendar('missing')).toBeUndefined();

    expect(session.updateRange('meeting', { startTime: '10:00', endTime: '11:00' })).toBe(true);
    expect(session.getAllRanges(['work'])).toEqual([
      makeRange('meeting', 'Meeting', {
        startTime: '10:00',
        endTime: '11:00',
      }),
    ]);

    expect(session.removeRange('gym')).toBe(true);
    expect(session.getAllRanges(['personal'])).toEqual([]);
    expect(session.removeRange('missing')).toBe(false);

    session.addRange('personal', makeRange('lunch', 'Lunch', { startTime: '12:00', endTime: '13:00' }));
    expect(session.getAllRanges(['personal'])).toEqual([
      makeRange('lunch', 'Lunch', {
        startTime: '12:00',
        endTime: '13:00',
      }),
    ]);
  });
});
