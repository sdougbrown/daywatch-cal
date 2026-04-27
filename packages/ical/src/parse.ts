import type { DateRange } from '@daywatch/cal';
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

interface AttendeeInfo {
  email: string;
  name?: string;
  role?: 'required' | 'optional' | 'chair' | 'non-participant';
  status?: 'accepted' | 'tentative' | 'declined' | 'needs-action';
}

interface OrganizerInfo {
  email: string;
  name?: string;
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

function getEventDateFields(
  component: Component,
  event: Event,
): Pick<DateRange, 'dates' | 'fromDate' | 'toDate'> {
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

function getTimeFields(
  component: Component,
  event: Event,
): Pick<DateRange, 'startTime' | 'endTime' | 'duration' | 'timezone'> {
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

function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, '');
}

function mapAttendeeRole(value: string | null | undefined): AttendeeInfo['role'] | undefined {
  switch (value?.toUpperCase()) {
    case 'REQ-PARTICIPANT':
      return 'required';
    case 'OPT-PARTICIPANT':
      return 'optional';
    case 'CHAIR':
      return 'chair';
    case 'NON-PARTICIPANT':
      return 'non-participant';
    default:
      return undefined;
  }
}

function mapAttendeeStatus(value: string | null | undefined): AttendeeInfo['status'] | undefined {
  switch (value?.toUpperCase()) {
    case 'ACCEPTED':
      return 'accepted';
    case 'TENTATIVE':
      return 'tentative';
    case 'DECLINED':
      return 'declined';
    case 'NEEDS-ACTION':
      return 'needs-action';
    default:
      return undefined;
  }
}

function extractAttendees(component: Component): AttendeeInfo[] {
  const attendees: AttendeeInfo[] = [];

  for (const property of component.getAllProperties('attendee')) {
    const rawValue = property.getFirstValue();
    if (typeof rawValue !== 'string' || rawValue.trim() === '') {
      continue;
    }

    const email = stripMailto(rawValue.trim());
    if (email === '') {
      continue;
    }

    const attendee: AttendeeInfo = { email };
    const name = property.getFirstParameter('cn');
    if (typeof name === 'string' && name.trim() !== '') {
      attendee.name = name;
    }

    const role = mapAttendeeRole(property.getFirstParameter('role'));
    if (role) {
      attendee.role = role;
    }

    const status = mapAttendeeStatus(property.getFirstParameter('partstat'));
    if (status) {
      attendee.status = status;
    }

    attendees.push(attendee);
  }

  return attendees;
}

function extractOrganizer(component: Component): OrganizerInfo | undefined {
  const property = component.getFirstProperty('organizer');
  if (!property) {
    return undefined;
  }

  const rawValue = property.getFirstValue();
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return undefined;
  }

  const email = stripMailto(rawValue.trim());
  if (email === '') {
    return undefined;
  }

  const organizer: OrganizerInfo = { email };
  const name = property.getFirstParameter('cn');
  if (typeof name === 'string' && name.trim() !== '') {
    organizer.name = name;
  }

  return organizer;
}

const VEVENT_BLOCK_PATTERN = /BEGIN:VEVENT\n([\s\S]*?)END:VEVENT/g;

export function detectDataWindow(icsText: string): ParseWindow | null {
  const unfoldedText = icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  // Only scan within VEVENT blocks to avoid VTIMEZONE DTSTART dates
  for (const blockMatch of unfoldedText.matchAll(VEVENT_BLOCK_PATTERN)) {
    const block = blockMatch[1];
    for (const match of block.matchAll(ICS_DATE_PATTERN)) {
      const dateValue = match[1] ?? match[2];
      if (!dateValue) {
        continue;
      }

      const parsedDate = parseIcsDateValue(dateValue);
      if (!earliestDate || parsedDate < earliestDate) {
        earliestDate = parsedDate;
      }
      if (!latestDate || parsedDate > latestDate) {
        latestDate = parsedDate;
      }
    }
  }

  if (!earliestDate || !latestDate) {
    return null;
  }

  // Pad by 1 month on each side to catch edge-of-window events
  const from = new Date(earliestDate);
  from.setMonth(from.getMonth() - 1);

  const to = new Date(latestDate);
  to.setMonth(to.getMonth() + 1);

  return { from, to };
}

function overlapsWindow(range: DateRange, window: ParseWindow): boolean {
  const windowFrom = formatDate(window.from);
  const windowTo = formatDate(window.to);

  if (range.dates?.length) {
    return range.dates.some(
      (date) => compareDates(date, windowFrom) >= 0 && compareDates(date, windowTo) <= 0,
    );
  }

  if (range.toDate && compareDates(range.toDate, windowFrom) < 0) {
    return false;
  }

  if (range.fromDate && compareDates(range.fromDate, windowTo) > 0) {
    return false;
  }

  const hasRecurrence = Boolean(
    range.everyWeekday?.length || range.everyDate?.length || range.everyMonth?.length,
  );
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

  const metadata: Record<string, unknown> = {};
  const attendees = extractAttendees(component);
  const organizer = extractOrganizer(component);
  const location = event.location || undefined;

  if (attendees.length > 0) {
    metadata.attendees = attendees;
  }
  if (organizer) {
    metadata.organizer = organizer;
  }
  if (location) {
    metadata.location = location;
  }
  const transp = component.getFirstPropertyValue('transp');
  if (typeof transp === 'string' && transp.toUpperCase() === 'TRANSPARENT') {
    metadata.transparent = true;
  }

  const status = component.getFirstPropertyValue('status');
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (normalized === 'tentative' || normalized === 'confirmed' || normalized === 'cancelled') {
      metadata.status = normalized;
    }
  }
  if (Object.keys(metadata).length > 0) {
    baseRange.metadata = metadata;
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
        console.warn(
          `Skipping VEVENT ${baseRange.id}: no occurrences in window (${mapped.reason})`,
        );
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
      baseRange.dates = baseRange.dates.filter((date) => !exceptDateSet.has(date));
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
