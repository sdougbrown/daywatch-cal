import ICAL from 'ical.js';

import type { DateRange } from '@neo-reckoning/core';

import { DEFAULT_PRODID } from '../src/constants.js';
import { generateICS } from '../src/generate.js';

function byUid(calendar: InstanceType<typeof ICAL.Component>, uid: string): InstanceType<typeof ICAL.Component> {
  const event = calendar.getAllSubcomponents('vevent').find(item => item.getFirstPropertyValue('uid') === uid);
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
        fixedBetween: true,
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
        fixedBetween: true,
        everyDate: [1, 15],
      },
    ];

    const calendar = new ICAL.Component(ICAL.parse(generateICS(ranges)));

    expect(calendar.getAllSubcomponents('vevent')).toHaveLength(4);

    const holiday = byUid(calendar, 'holiday');
    expect(holiday.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260321');
    expect(holiday.getFirstProperty('dtend')).toBeNull();

    const trip = byUid(calendar, 'trip');
    expect(trip.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260324');
    expect(trip.getFirstProperty('dtend')?.toICALString()).toBe('DTEND;VALUE=DATE:20260327');

    const weeklyClass = byUid(calendar, 'weekly-class');
    expect(weeklyClass.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;TZID=America/Toronto:20260302T090000');
    expect(weeklyClass.getFirstProperty('dtend')?.toICALString()).toBe('DTEND;TZID=America/Toronto:20260302T100000');
    expect(weeklyClass.getFirstPropertyValue('rrule')?.toString()).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260417T090000');

    const exdate = weeklyClass.getFirstProperty('exdate');
    expect(exdate?.getFirstParameter('tzid')).toBe('America/Toronto');
    expect(exdate?.getValues().map(value => value.toICALString())).toEqual([
      '20260316T090000',
      '20260320T090000',
    ]);

    const paydays = byUid(calendar, 'paydays');
    expect(paydays.getFirstProperty('dtstart')?.toICALString()).toBe('DTSTART;VALUE=DATE:20260101');
    expect(paydays.getFirstProperty('rrule')?.toICALString()).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15;UNTIL=20260315');
  });
});
