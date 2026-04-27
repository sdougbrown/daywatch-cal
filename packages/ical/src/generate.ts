import type { DateRange } from '@daywatch/cal';
import ICAL from 'ical.js';

import { DEFAULT_PRODID } from './constants.js';
import { buildRRuleFromDateRange } from './rrule-mapping.js';

interface GenerateOptions {
  calendarName?: string;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatDate(date: Date): string {
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatTime(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function addDays(date: string, offset: number): string {
  const { year, month, day } = parseDate(date);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + offset);
  return formatDate(next);
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const { year, month, day } = parseDate(date);
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, hour, minute));
  next.setUTCMinutes(next.getUTCMinutes() + minutes);

  return {
    date: formatDate(next),
    time: formatTime(next),
  };
}

function hasRecurrence(range: DateRange): boolean {
  return Boolean(range.everyWeekday?.length || range.everyDate?.length || range.everyMonth?.length);
}

function getAnchorDate(range: DateRange): string | null {
  if (range.dates?.length === 1) {
    return range.dates[0];
  }

  if (range.dates?.length && range.dates.length > 1) {
    console.warn(
      `Skipping DateRange ${range.id}: multiple explicit dates are not supported for export`,
    );
    return null;
  }

  return range.fromDate ?? null;
}

function createTime(
  date: string,
  time: string | null,
  timezone?: string | null,
): InstanceType<typeof ICAL.Time> {
  const { year, month, day } = parseDate(date);

  if (!time) {
    return ICAL.Time.fromData({ year, month, day, isDate: true });
  }

  const [hour, minute] = time.split(':').map(Number);
  const zone = timezone === 'UTC' ? ICAL.Timezone.utcTimezone : undefined;

  return ICAL.Time.fromData(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
      isDate: false,
    },
    zone,
  );
}

function createDateProperty(
  name: string,
  date: string,
  time: string | null,
  timezone?: string | null,
): InstanceType<typeof ICAL.Property> {
  const property = new ICAL.Property(name);
  if (!time) {
    property.resetType('date');
  }

  property.setValue(createTime(date, time, timezone));

  if (time && timezone && timezone !== 'UTC') {
    property.setParameter('tzid', timezone);
  }

  return property;
}

function addEventEnd(
  component: InstanceType<typeof ICAL.Component>,
  range: DateRange,
  anchorDate: string,
): void {
  if (!range.startTime) {
    if (!hasRecurrence(range) && range.fromDate && range.toDate) {
      component.addProperty(createDateProperty('dtend', addDays(range.toDate, 1), null));
    }
    return;
  }

  if (hasRecurrence(range) || (range.dates?.length === 1 && !range.fromDate && !range.toDate)) {
    if (range.endTime) {
      component.addProperty(createDateProperty('dtend', anchorDate, range.endTime, range.timezone));
      return;
    }

    if (range.duration) {
      const end = addMinutes(anchorDate, range.startTime, range.duration);
      component.addProperty(createDateProperty('dtend', end.date, end.time, range.timezone));
    }
    return;
  }

  if (range.toDate) {
    if (range.endTime) {
      component.addProperty(
        createDateProperty('dtend', range.toDate, range.endTime, range.timezone),
      );
      return;
    }

    if (range.duration) {
      const end = addMinutes(range.toDate, range.startTime, range.duration);
      component.addProperty(createDateProperty('dtend', end.date, end.time, range.timezone));
    }
  }
}

function addExceptDates(component: InstanceType<typeof ICAL.Component>, range: DateRange): void {
  if (!range.exceptDates?.length) {
    return;
  }

  const property = new ICAL.Property('exdate');
  if (!range.startTime) {
    property.resetType('date');
    property.setValues(range.exceptDates.map((date) => createTime(date, null)));
  } else {
    const startTime = range.startTime;
    property.setValues(
      range.exceptDates.map((date) => createTime(date, startTime, range.timezone)),
    );
    if (range.timezone && range.timezone !== 'UTC') {
      property.setParameter('tzid', range.timezone);
    }
  }

  component.addProperty(property);
}

function buildEvent(range: DateRange): InstanceType<typeof ICAL.Component> | null {
  const recurrence = hasRecurrence(range);
  const anchorDate = getAnchorDate(range);
  if (!anchorDate) {
    console.warn(`Skipping DateRange ${range.id}: export requires a single anchor date`);
    return null;
  }

  const component = new ICAL.Component('vevent');
  component.addPropertyWithValue('uid', range.id);
  component.addPropertyWithValue('summary', range.label);

  if (range.title) {
    component.addPropertyWithValue('description', range.title);
  }

  const metadata = range.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    if (metadata.transparent === true) {
      component.addPropertyWithValue('transp', 'TRANSPARENT');
    }

    if (
      metadata.status === 'tentative' ||
      metadata.status === 'confirmed' ||
      metadata.status === 'cancelled'
    ) {
      component.addPropertyWithValue('status', metadata.status.toUpperCase());
    }
  }

  component.addProperty(
    createDateProperty('dtstart', anchorDate, range.startTime ?? null, range.timezone),
  );
  addEventEnd(component, range, anchorDate);

  if (recurrence) {
    const rule = buildRRuleFromDateRange(range);
    if (!rule) {
      console.warn(`Skipping DateRange ${range.id}: recurrence pattern cannot be exported`);
      return null;
    }

    component.addPropertyWithValue('rrule', rule);
  }

  addExceptDates(component, range);

  return component;
}

export function generateICS(ranges: DateRange[], options: GenerateOptions = {}): string {
  const calendar = new ICAL.Component('vcalendar');
  calendar.addPropertyWithValue('prodid', DEFAULT_PRODID);
  calendar.addPropertyWithValue('version', '2.0');
  calendar.addPropertyWithValue('calscale', 'GREGORIAN');

  if (options.calendarName) {
    calendar.addPropertyWithValue('x-wr-calname', options.calendarName);
  }

  for (const range of ranges) {
    const event = buildEvent(range);
    if (event) {
      calendar.addSubcomponent(event);
    }
  }

  return calendar.toString();
}
