import { readFileSync } from 'node:fs';

import { vi } from 'vitest';
import type { DateRange } from '@daywatch/cal';

import { detectDataWindow, parseICS } from '../src/parse.js';

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function makeWindow(from: string, to: string): { from: Date; to: Date } {
  return {
    from: new Date(`${from}T00:00:00`),
    to: new Date(`${to}T00:00:00`),
  };
}

function formatDateValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function byId(ranges: DateRange[], id: string): DateRange {
  const range = ranges.find((item) => item.id === id);
  if (!range) {
    throw new Error(`Missing range ${id}`);
  }
  return range;
}

describe('parseICS', () => {
  it('detects a data window from raw DTSTART, DTEND, and UNTIL values', () => {
    const dataWindow = detectDataWindow(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:semester',
        'DTSTART;VALUE=DATE:20240903',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;',
        ' UNTIL=20250620T235959Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:wrap-up',
        'DTEND;VALUE=DATE:20250701',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    );

    expect(dataWindow).not.toBeNull();
    expect(formatDateValue(dataWindow!.from)).toBe('2024-08-03');
    expect(formatDateValue(dataWindow!.to)).toBe('2025-08-01');
  });

  it('returns null when raw ICS text has no DTSTART, DTEND, or UNTIL values', () => {
    expect(
      detectDataWindow(
        [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:no-dates',
          'SUMMARY:No dates here',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      ),
    ).toBeNull();
  });

  it('parses single and multi-day events from VEVENT components', () => {
    const ranges = parseICS(
      loadFixture('simple-events.ics'),
      makeWindow('2026-03-01', '2026-03-31'),
    );

    expect(ranges).toHaveLength(4);
    expect(byId(ranges, 'all-day-single')).toEqual({
      id: 'all-day-single',
      label: 'Holiday',
      title: 'One day off',
      dates: ['2026-03-21'],
    });
    expect(byId(ranges, 'timed-single')).toEqual({
      id: 'timed-single',
      label: 'Team Sync',
      title: 'Weekly planning',
      dates: ['2026-03-22'],
      startTime: '09:00',
      endTime: '10:30',
      duration: 90,
      timezone: null,
    });
    expect(byId(ranges, 'trip')).toEqual({
      id: 'trip',
      label: 'Conference Trip',
      title: 'Travel and conference',
      fromDate: '2026-03-24',
      toDate: '2026-03-26',
    });
    expect(byId(ranges, 'toronto-lunch')).toEqual({
      id: 'toronto-lunch',
      label: 'Toronto Lunch',
      title: 'Meet downtown',
      dates: ['2026-03-28'],
      startTime: '12:00',
      endTime: '13:30',
      duration: 90,
      timezone: 'America/Toronto',
    });
  });

  it('maps weekly RRULEs, EXDATE values, and timezone metadata', () => {
    const [range] = parseICS(
      loadFixture('recurring-weekly.ics'),
      makeWindow('2026-03-01', '2026-04-30'),
    );

    expect(range).toEqual({
      id: 'weekly-class',
      label: 'Class',
      title: 'Recurring class',
      fromDate: '2026-03-02',
      toDate: '2026-04-17',
      fixedBetween: true,
      everyWeekday: [1, 3, 5],
      exceptDates: ['2026-03-16', '2026-03-20'],
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      timezone: 'America/Toronto',
    });
  });

  it('maps monthly BYMONTHDAY recurrences with COUNT into DateRange bounds', () => {
    const [range] = parseICS(
      loadFixture('recurring-monthly.ics'),
      makeWindow('2026-01-01', '2026-03-31'),
    );

    expect(range).toEqual({
      id: 'paydays',
      label: 'Paydays',
      title: 'Monthly payroll cadence',
      fromDate: '2026-01-01',
      toDate: '2026-03-15',
      fixedBetween: true,
      everyDate: [1, 15],
      exceptDates: ['2026-03-15'],
    });
  });

  it('maps daily and yearly Tier 1 RRULEs and filters by the requested window', () => {
    const marchRanges = parseICS(
      loadFixture('multi-event.ics'),
      makeWindow('2026-03-01', '2026-03-31'),
    );
    const juneRanges = parseICS(
      loadFixture('multi-event.ics'),
      makeWindow('2026-06-01', '2026-06-30'),
    );

    expect(marchRanges).toEqual([
      {
        id: 'daily-window',
        label: 'Sprint',
        title: 'Five day sprint',
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        fixedBetween: true,
        everyWeekday: [0, 1, 2, 3, 4, 5, 6],
      },
      {
        id: 'yearly-months',
        label: 'Summer and Winter Window',
        title: 'Seasonal schedule',
        fromDate: '2026-01-01',
        everyMonth: [6, 12],
      },
    ]);

    expect(juneRanges).toEqual([
      {
        id: 'yearly-months',
        label: 'Summer and Winter Window',
        title: 'Seasonal schedule',
        fromDate: '2026-01-01',
        everyMonth: [6, 12],
      },
    ]);
  });

  it('expands Tier 2 RRULEs into explicit dates within the requested window', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ranges = parseICS(
      loadFixture('complex-rrules.ics'),
      makeWindow('2026-03-01', '2026-04-30'),
    );

    expect(ranges).toEqual([
      {
        id: 'complex-monthly',
        label: 'Second Tuesday',
        title: 'Expanded monthly recurrence',
        fromDate: '2026-03-01',
        dates: ['2026-03-10', '2026-04-14'],
      },
      {
        id: 'biweekly-monday',
        label: 'Alternating Monday',
        title: 'Expanded weekly recurrence',
        fromDate: '2026-03-02',
        dates: ['2026-03-02', '2026-03-16', '2026-03-30', '2026-04-13', '2026-04-27'],
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        timezone: 'America/Toronto',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('parses realistic Google Calendar exports with VTIMEZONE data', () => {
    const ranges = parseICS(
      loadFixture('google-export.ics'),
      makeWindow('2026-06-01', '2026-12-31'),
    );

    expect(ranges).toEqual([
      {
        id: 'google-1',
        label: 'Board Review',
        title: 'Quarterly board review',
        dates: ['2026-06-15'],
        startTime: '14:00',
        endTime: '15:30',
        duration: 90,
        timezone: 'America/New_York',
        metadata: {
          status: 'confirmed',
        },
      },
      {
        id: 'google-2',
        label: 'Company Shutdown',
        fromDate: '2026-12-24',
        toDate: '2027-01-01',
      },
    ]);
  });

  it('extracts attendee, organizer, and location metadata from VEVENT properties', () => {
    const ranges = parseICS(
      loadFixture('shared-meetings-alice.ics'),
      makeWindow('2026-04-01', '2026-04-30'),
    );

    expect(byId(ranges, 'shared-sync')).toEqual({
      id: 'shared-sync',
      label: 'Shared Sync',
      title: 'Cross-calendar planning',
      dates: ['2026-04-02'],
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
      timezone: 'UTC',
      metadata: {
        attendees: [
          {
            email: 'alice@example.com',
            name: 'Alice Example',
            role: 'required',
            status: 'accepted',
          },
          {
            email: 'bob@example.com',
            name: 'Bob Example',
            role: 'optional',
            status: 'tentative',
          },
        ],
        organizer: {
          email: 'alice@example.com',
          name: 'Alice Example',
        },
        location: 'Room 500',
      },
    });

    expect(byId(ranges, 'shared-weekly')).toEqual(
      expect.objectContaining({
        metadata: {
          attendees: [
            {
              email: 'alice@example.com',
              name: 'Alice Example',
              role: 'required',
              status: 'accepted',
            },
            {
              email: 'bob@example.com',
              name: 'Bob Example',
              role: 'required',
              status: 'needs-action',
            },
          ],
          organizer: {
            email: 'alice@example.com',
            name: 'Alice Example',
          },
        },
      }),
    );
  });

  it('omits metadata when a VEVENT has no attendees, organizer, or location', () => {
    const ranges = parseICS(
      loadFixture('simple-events.ics'),
      makeWindow('2026-03-01', '2026-03-31'),
    );

    expect(byId(ranges, 'timed-single').metadata).toBeUndefined();
  });

  it('extracts TRANSP and STATUS into metadata', () => {
    const ranges = parseICS(
      loadFixture('transparency-events.ics'),
      makeWindow('2026-04-01', '2026-04-30'),
    );

    expect(byId(ranges, 'transp-transparent').metadata).toEqual(
      expect.objectContaining({
        transparent: true,
        status: 'confirmed',
      }),
    );

    const opaqueRange = byId(ranges, 'transp-opaque');
    expect(opaqueRange.metadata).toEqual(
      expect.objectContaining({
        status: 'tentative',
      }),
    );
    expect(opaqueRange.metadata).not.toHaveProperty('transparent');

    const noTranspRange = byId(ranges, 'transp-none');
    expect(noTranspRange.metadata).toEqual(
      expect.objectContaining({
        status: 'cancelled',
      }),
    );
    expect(noTranspRange.metadata).not.toHaveProperty('transparent');
  });

  it('extracts organizer email even when no CN parameter is present', () => {
    const ranges = parseICS(
      loadFixture('shared-meetings-bob.ics'),
      makeWindow('2026-04-01', '2026-04-30'),
    );

    expect(byId(ranges, 'shared-sync')).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          organizer: {
            email: 'alice@example.com',
          },
        }),
      }),
    );
  });
});
