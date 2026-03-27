import type { DateRange } from '@neo-reckoning/core';
import ICAL from 'ical.js';

import { expandRRuleToExplicitDates } from './rrule-expand.js';
import { mapRRuleToDateRangeFields } from './rrule-mapping.js';

type Component = InstanceType<typeof ICAL.Component>;
type Event = InstanceType<typeof ICAL.Event>;
type Property = InstanceType<typeof ICAL.Property>;
type Time = InstanceType<typeof ICAL.Time>;

interface ParseWindow {
  from: Date;
  to: Date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(value: Time): string {
  return `${pad(value.hour)}:${pad(value.minute)}`;
}

function formatDateFromTime(value: Time): string {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: string, offset: number): string {
  const next = parseDate(date);
  next.setDate(next.getDate() + offset);
  return formatDate(next);
}

function getDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function compareDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

function getDayOfWeek(date: string): number {
  return parseDate(date).getDay();
}

function rangeMatchesDate(range: DateRange, date: string): boolean {
  if (range.fromDate && compareDates(date, range.fromDate) < 0) {
    return false;
  }

  if (range.toDate && compareDates(date, range.toDate) > 0) {
    return false;
  }

  if (range.exceptDates?.includes(date)) {
    return false;
  }

  if (range.dates) {
    return range.dates.includes(date);
  }

  const hasRecurrence = Boolean(range.everyWeekday?.length || range.everyDate?.length || range.everyMonth?.length);
  if (!hasRecurrence) {
    return true;
  }

  if (range.everyWeekday?.length && !range.everyWeekday.includes(getDayOfWeek(date))) {
    return false;
  }

  const parts = getDateParts(date);

  if (range.everyDate?.length && !range.everyDate.includes(parts.day)) {
    return false;
  }

  if (range.everyMonth?.length && !range.everyMonth.includes(parts.month)) {
    return false;
  }

  return true;
}

function getEffectiveBounds(range: DateRange, window: ParseWindow): { from: string; to: string } | null {
  const windowFrom = formatDate(window.from);
  const windowTo = formatDate(window.to);

  let effectiveFrom = windowFrom;
  let effectiveTo = windowTo;

  if (range.fromDate && compareDates(range.fromDate, effectiveFrom) > 0) {
    effectiveFrom = range.fromDate;
  }

  if (range.toDate && compareDates(range.toDate, effectiveTo) < 0) {
    effectiveTo = range.toDate;
  }

  if (range.dates?.length) {
    const sortedDates = [...range.dates].sort();
    if (compareDates(sortedDates[0], effectiveFrom) > 0) {
      effectiveFrom = sortedDates[0];
    }
    if (compareDates(sortedDates[sortedDates.length - 1], effectiveTo) < 0) {
      effectiveTo = sortedDates[sortedDates.length - 1];
    }
  }

  if (compareDates(effectiveFrom, effectiveTo) > 0) {
    return null;
  }

  return {
    from: effectiveFrom,
    to: effectiveTo,
  };
}

function overlapsWindow(range: DateRange, window: ParseWindow): boolean {
  const bounds = getEffectiveBounds(range, window);
  if (!bounds) {
    return false;
  }

  const current = parseDate(bounds.from);
  const end = parseDate(bounds.to);

  while (current <= end) {
    const currentDate = formatDate(current);
    if (rangeMatchesDate(range, currentDate)) {
      return true;
    }

    current.setDate(current.getDate() + 1);
  }

  return false;
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
