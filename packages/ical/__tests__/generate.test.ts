import ICAL from 'ical.js';

import type { DateRange } from '@daywatch/cal';

import { DEFAULT_PRODID } from '../src/constants.js';
import { generateICS } from '../src/generate.js';

function byUid(
  calendar: InstanceType<typeof ICAL.Component>,
  uid: string,
): InstanceType<typeof ICAL.Component> {
  const event = calendar
    .getAllSubcomponents('vevent')
    .find((item) => item.getFirstPropertyValue('uid') === uid);
  if (!event) {
    throw new Error(`Missing VEVENT ${uid}`);
  }
  return event;
}

describe('generateICS', () => {
  it('generates a valid VCALENDAR wrapper with calendar metadata', () => {
    const ics = generateICS([], { calendarName: 'Work Calendar' });
    const calendar = new ICAL.Component(ICAL.parse(ics));

    expect(calendar.name).toBe('vcalendar');
    expect(calendar.getFirstPropertyValue('version')).toBe('2.0');
    expect(calendar.getFirstPropertyValue('prodid')).toBe(DEFAULT_PRODID);
    expect(calendar.getFirstPropertyValue('x-wr-calname')).toBe('Work Calendar');
  });

  it('exports single events, spans, RRULEs, timezones, and EXDATE values', () => {
    const ranges: DateRange[] = [
      {
        id: 'holiday',
        label: 'Holiday',
        title: 'One day off',
        dates: ['2026-03-21'],
      },
      {
        id: 'trip',
        label: 'Conference Trip',
        title: 'Travel and conference',
        fromDate: '2026-03-24',
        toDate: '2026-03-26',
      },
      {
        id: 'weekly-class',
        label: 'Class',
        title: 'Recurring class',
        fromDate: '2026-03-02',
        toDate: '2026-04-17',
        everyWeekday: [1, 3, 5],
        exceptDates: ['2026-03-16', '2026-03-20'],
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        timezone: 'America/Toronto',
      },
      {
        id: 'paydays',
        label: 'Paydays',
        fromDate: '2026-01-01',
        toDate: '2026-03-15',
        everyDate: [1, 15],
      },
      {
        id: 'fixed-timed',
        label: 'Daily Office Hours',
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
        fixedBetween: true,
        everyWeekday: [1],
        startTime: '09:00',
        endTime: '10:00',
      },
      {
        id: 'fixed-timed-plain',
        label: 'Daily Standup',
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
        fixedBetween: true,
        startTime: '11:00',
        endTime: '11:30',
      },
      {
        id: 'fixed-timed-open',
        label: 'Open Daily Hold',
        fromDate: '2026-03-10',
        fixedBetween: true,
        startTime: '13:00',
        endTime: '13:30',
      },
      {
        id: 'fixed-span',
        label: 'Spring Break',
        fromDate: '2026-03-10',
        toDate: '2026-03-12',
        fixedBetween: true,
        everyWeekday: [1],
      },
      {
        id: 'fixed-span-excluded',
        label: 'Reading Week',
        fromDate: '2026-03-10',
        toDate: '2026-03-14',
        fixedBetween: true,
        exceptDates: ['2026-03-12'],
        exceptBetween: [['2026-03-13', '2026-03-14']],
      },
    ];

    const calendar = new ICAL.Component(ICAL.parse(generateICS(ranges)));

    expect(calendar.getAllSubcomponents('vevent')).toHaveLength(9);

    const holiday = byUid(calendar, 'holiday');
    expect(holiday.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260321');
    expect(holiday.getFirstProperty('dtend')).toBeNull();

    const trip = byUid(calendar, 'trip');
    expect(trip.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260324');
    expect(trip.getFirstProperty('dtend')?.toICALString()).toBe('DTEND;VALUE=DATE:20260327');

    const weeklyClass = byUid(calendar, 'weekly-class');
    expect(weeklyClass.getFirstProperty('dtstart')?.toICALString()).toBe(
      'DTSTART;TZID=America/Toronto:20260302T090000',
    );
    expect(weeklyClass.getFirstProperty('dtend')?.toICALString()).toBe(
      'DTEND;TZID=America/Toronto:20260302T100000',
    );
    expect(weeklyClass.getFirstPropertyValue('rrule')?.toString()).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260417T090000',
    );

    const exdate = weeklyClass.getFirstProperty('exdate');
    expect(exdate?.getFirstParameter('tzid')).toBe('America/Toronto');
    expect(exdate?.getValues().map((value) => value.toICALString())).toEqual([
      '20260316T090000',
      '20260320T090000',
    ]);

    const paydays = byUid(calendar, 'paydays');
    expect(paydays.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260101');
    expect(paydays.getFirstProperty('rrule')?.toICALString()).toBe(
      'RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15;UNTIL=20260315',
    );

    const fixedTimed = byUid(calendar, 'fixed-timed');
    expect(fixedTimed.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART:20260310T090000');
    expect(fixedTimed.getFirstProperty('rrule')?.toICALString()).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20260312T090000',
    );
    expect(fixedTimed.getFirstProperty('dtend')?.toICALString()).toBe('DTEND:20260310T100000');

    const fixedTimedPlain = byUid(calendar, 'fixed-timed-plain');
    expect(fixedTimedPlain.getFirstProperty('rrule')?.toICALString()).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20260312T110000',
    );
    expect(fixedTimedPlain.getFirstProperty('dtend')?.toICALString()).toBe('DTEND:20260310T113000');

    const fixedTimedOpen = byUid(calendar, 'fixed-timed-open');
    expect(fixedTimedOpen.getFirstProperty('dtstart')?.toICALString()).toBe(
      'DTSTART:20260310T130000',
    );
    expect(fixedTimedOpen.getFirstProperty('rrule')?.toICALString()).toBe('RRULE:FREQ=DAILY');
    expect(fixedTimedOpen.getFirstProperty('dtend')?.toICALString()).toBe('DTEND:20260310T133000');

    const fixedSpan = byUid(calendar, 'fixed-span');
    expect(fixedSpan.getFirstProperty('dtstart')?.toICALString()).toBe(
      'DTSTART;VALUE=DATE:20260310',
    );
    expect(fixedSpan.getFirstProperty('dtend')?.toICALString()).toBe('DTEND;VALUE=DATE:20260313');
    expect(fixedSpan.getFirstProperty('rrule')).toBeNull();

    const fixedSpanExcluded = byUid(calendar, 'fixed-span-excluded');
    expect(fixedSpanExcluded.getFirstProperty('rrule')?.toICALString()).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20260314',
    );
    expect(fixedSpanExcluded.getFirstProperty('dtend')).toBeNull();
    expect(fixedSpanExcluded.getFirstProperty('exdate')?.toICALString()).toBe(
      'EXDATE;VALUE=DATE:20260312,20260313,20260314',
    );
  });

  it('exports TRANSP:TRANSPARENT from the canonical transparency field, with legacy metadata fallback', () => {
    const ranges: DateRange[] = [
      {
        id: 'free-canonical',
        label: 'Free',
        dates: ['2026-03-21'],
        transparency: 'transparent',
      },
      {
        id: 'free-legacy',
        label: 'Free Legacy',
        dates: ['2026-03-22'],
        metadata: { transparent: true },
      },
      {
        id: 'opaque',
        label: 'Opaque',
        dates: ['2026-03-23'],
        transparency: 'opaque',
      },
      {
        id: 'absent',
        label: 'Absent',
        dates: ['2026-03-24'],
      },
    ];

    const calendar = new ICAL.Component(ICAL.parse(generateICS(ranges)));

    const freeCanonical = byUid(calendar, 'free-canonical');
    expect(freeCanonical.getFirstPropertyValue('transp')).toBe('TRANSPARENT');

    const freeLegacy = byUid(calendar, 'free-legacy');
    expect(freeLegacy.getFirstPropertyValue('transp')).toBe('TRANSPARENT');

    const opaque = byUid(calendar, 'opaque');
    expect(opaque.getFirstProperty('transp')).toBeNull();

    const absent = byUid(calendar, 'absent');
    expect(absent.getFirstProperty('transp')).toBeNull();
  });

  it('does not emit TRANSP when an explicit opaque transparency overrides legacy metadata', () => {
    const ranges: DateRange[] = [
      {
        id: 'contradictory',
        label: 'Contradictory',
        dates: ['2026-03-25'],
        transparency: 'opaque',
        metadata: { transparent: true },
      },
    ];

    const calendar = new ICAL.Component(ICAL.parse(generateICS(ranges)));
    const event = byUid(calendar, 'contradictory');
    expect(event.getFirstProperty('transp')).toBeNull();
  });
});
