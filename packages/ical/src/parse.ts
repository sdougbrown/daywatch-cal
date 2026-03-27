import type { DateRange } from '@neo-reckoning/core';
import ICAL from 'ical.js';

import { expandRRuleToExplicitDates } from './rrule-expand.js';
import { mapRRuleToDateRangeFields } from './rrule-mapping.js';
import { addDays, compareDates, formatDate, pad } from './utils.js';

type Component = InstanceType<typeof ICAL.Component>;
type Event = InstanceType<typeof ICAL.Event>;
type Property = InstanceType<typeof ICAL.Property>;
type Time = InstanceType<typeof ICAL.Time>;

interface ParseWindow {
  from: Date;
  to: Date;
}

const ICS_DATE_PATTERN =
  /(?:^|\n)(?:DTSTART|DTEND)(?:;[^:\n]*)?:(\d{8})(?:T\d{6}Z?)?|(?:^|\n)RRULE(?:;[^:\n]*)?:[^\n]*\bUNTIL=(\d{8})(?:T\d{6}Z?)?/g;

function formatTime(value: Time): string {
  return `${pad(value.hour)}:${pad(value.minute)}`;
}

function formatDateFromTime(value: Time): string {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

function parseIcsDateValue(dateValue: string): Date {
  const year = Number(dateValue.slice(0, 4));
  const month = Number(dateValue.slice(4, 6));
  const day = Number(dateValue.slice(6, 8));
  return new Date(year, month - 1, day);
}

function hashString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `ical-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function getRangeId(component: Component, event: Event): string {
  return event.uid || hashString(component.toString());
}

function getTimezone(startProperty: Property | null, start: Time): string | null | undefined {
  const tzid = startProperty?.getFirstParameter('tzid');
  if (tzid) {
    return tzid;
  }

  if (!start.isDate && start.zone?.tzid === 'UTC') {
    return 'UTC';
  }

  if (!start.isDate) {
    return null;
  }

  return undefined;
}

function getInclusiveEndDate(component: Component, event: Event): string {
  const start = event.startDate;
  const end = event.endDate;

  if (!component.hasProperty('dtend') && !component.hasProperty('duration')) {
    return formatDateFromTime(start);
  }

  if (start.isDate) {
    return addDays(formatDateFromTime(end), -1);
  }

  return formatDateFromTime(end);
}

function getEventDateFields(component: Component, event: Event): Pick<DateRange, 'dates' | 'fromDate' | 'toDate'> {
  const startDate = formatDateFromTime(event.startDate);
  const endDate = getInclusiveEndDate(component, event);

  if (startDate === endDate) {
    return {
      dates: [startDate],
    };
  }

  return {
    fromDate: startDate,
    toDate: endDate,
  };
}

function getTimeFields(component: Component, event: Event): Pick<DateRange, 'startTime' | 'endTime' | 'duration' | 'timezone'> {
  const start = event.startDate;

  if (start.isDate) {
    return {};
  }

  const fields: Pick<DateRange, 'startTime' | 'endTime' | 'duration' | 'timezone'> = {
    startTime: formatTime(start),
  };

  const timezone = getTimezone(component.getFirstProperty('dtstart'), start);
  if (timezone !== undefined) {
    fields.timezone = timezone;
  }

  if (component.hasProperty('dtend') || component.hasProperty('duration')) {
    fields.endTime = formatTime(event.endDate);

    const durationMinutes = Math.round(event.duration.toSeconds() / 60);
    if (durationMinutes > 0) {
      fields.duration = durationMinutes;
    }
  }

  return fields;
}

function getExceptDates(component: Component): string[] | undefined {
  const exceptDates = new Set<string>();

  for (const property of component.getAllProperties('exdate')) {
    for (const value of property.getValues() as Time[]) {
      exceptDates.add(formatDateFromTime(value));
    }
  }

  return exceptDates.size > 0 ? [...exceptDates].sort() : undefined;
}

export function detectDataWindow(icsText: string): ParseWindow | null {
  const unfoldedText = icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  let latestDate: Date | null = null;

  for (const match of unfoldedText.matchAll(ICS_DATE_PATTERN)) {
    const dateValue = match[1] ?? match[2];
    if (!dateValue) {
      continue;
    }

    const parsedDate = parseIcsDateValue(dateValue);
    if (!latestDate || parsedDate > latestDate) {
      latestDate = parsedDate;
    }
  }

  if (!latestDate) {
    return null;
  }

  const from = new Date(latestDate);
  from.setMonth(from.getMonth() - 6);

  const to = new Date(latestDate);
  to.setMonth(to.getMonth() + 1);

  return { from, to };
}

function overlapsWindow(range: DateRange, window: ParseWindow): boolean {
  const windowFrom = formatDate(window.from);
  const windowTo = formatDate(window.to);

  if (range.dates?.length) {
    return range.dates.some(date => compareDates(date, windowFrom) >= 0 && compareDates(date, windowTo) <= 0);
  }

  if (range.toDate && compareDates(range.toDate, windowFrom) < 0) {
    return false;
  }

  if (range.fromDate && compareDates(range.fromDate, windowTo) > 0) {
    return false;
  }

  const hasRecurrence = Boolean(range.everyWeekday?.length || range.everyDate?.length || range.everyMonth?.length);
  if (hasRecurrence) {
    return true;
  }

  return true;
}

function buildDateRange(component: Component, window: ParseWindow): DateRange | null {
  if (component.hasProperty('recurrence-id')) {
    return null;
  }

  const event = new ICAL.Event(component);
  const dtstart = component.getFirstProperty('dtstart');
  if (!dtstart) {
    console.warn('Skipping VEVENT without DTSTART');
    return null;
  }

  const baseRange: DateRange = {
    id: getRangeId(component, event),
    label: event.summary || 'Untitled event',
  };

  if (event.description) {
    baseRange.title = event.description;
  }

  Object.assign(baseRange, getTimeFields(component, event));

  const rrules = component.getAllProperties('rrule');
  if (rrules.length > 1) {
    console.warn(`Skipping VEVENT ${baseRange.id}: multiple RRULE properties are not supported`);
    return null;
  }

  if (rrules.length === 1) {
    const rule = rrules[0].getFirstValue() as Time | InstanceType<typeof ICAL.Recur> | null;
    if (!(rule instanceof ICAL.Recur)) {
      console.warn(`Skipping VEVENT ${baseRange.id}: invalid RRULE value`);
      return null;
    }

    const mapped = mapRRuleToDateRangeFields(rule, event.startDate);
    if (!mapped.supported) {
      const expandedDates = expandRRuleToExplicitDates(
        rule.toString(),
        event.startDate.toJSDate(),
        window,
        {
          dtstartIsDate: event.startDate.isDate,
          dtstartIsUTC: event.startDate.zone?.tzid === 'UTC',
        },
      );

      if (expandedDates.length === 0) {
        console.warn(`Skipping VEVENT ${baseRange.id}: no occurrences in window (${mapped.reason})`);
        return null;
      }

      baseRange.fromDate = formatDateFromTime(event.startDate);
      baseRange.dates = expandedDates;
    } else {
      Object.assign(baseRange, mapped.fields);
    }
  } else {
    Object.assign(baseRange, getEventDateFields(component, event));
  }

  const exceptDates = getExceptDates(component);
  if (exceptDates) {
    baseRange.exceptDates = exceptDates;
    if (baseRange.dates?.length) {
      const exceptDateSet = new Set(exceptDates);
      baseRange.dates = baseRange.dates.filter(date => !exceptDateSet.has(date));
      if (baseRange.dates.length === 0) {
        return null;
      }
    }
  }

  return baseRange;
}

export function parseICS(icsText: string, window: ParseWindow): DateRange[] {
  const calendar = new ICAL.Component(ICAL.parse(icsText));
  const vevents = calendar.getAllSubcomponents('vevent');

  const ranges: DateRange[] = [];
  for (const vevent of vevents) {
    const range = buildDateRange(vevent, window);
    if (!range) {
      continue;
    }

    if (overlapsWindow(range, window)) {
      ranges.push(range);
    }
  }

  return ranges;
}
