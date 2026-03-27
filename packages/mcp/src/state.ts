import type { DateRange } from '@neo-reckoning/core';
import { RangeEvaluator } from '@neo-reckoning/core';

export interface LoadedCalendar {
  ranges: DateRange[];
  source: 'ics' | 'ranges';
}

export interface CalendarRangeEntry {
  calendarId: string;
  range: DateRange;
}

export class CalendarSession {
  calendars: Map<string, LoadedCalendar>;
  timezone: string;
  evaluator: RangeEvaluator;
  private nextCalendarNumber: number;

  constructor(timezone?: string) {
    this.timezone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.evaluator = new RangeEvaluator(this.timezone);
    this.calendars = new Map();
    this.nextCalendarNumber = 1;
  }

  createCalendarId(id?: string): string {
    if (id && id.trim()) {
      return id;
    }

    let nextId = `calendar-${this.nextCalendarNumber}`;
    while (this.calendars.has(nextId)) {
      this.nextCalendarNumber += 1;
      nextId = `calendar-${this.nextCalendarNumber}`;
    }

    this.nextCalendarNumber += 1;
    return nextId;
  }

  loadCalendar(id: string, ranges: DateRange[], source: 'ics' | 'ranges'): void {
    const calendarId = this.createCalendarId(id);
    this.calendars.set(calendarId, {
      ranges: [...ranges],
      source,
    });
  }

  getAllRanges(calendarIds?: string[]): DateRange[] {
    if (!calendarIds || calendarIds.length === 0) {
      return [...this.calendars.values()].flatMap(calendar => calendar.ranges);
    }

    const selectedIds = new Set(calendarIds);
    const ranges: DateRange[] = [];

    for (const [calendarId, calendar] of this.calendars.entries()) {
      if (selectedIds.has(calendarId)) {
        ranges.push(...calendar.ranges);
      }
    }

    return ranges;
  }

  getRangeEntries(calendarIds?: string[]): CalendarRangeEntry[] {
    if (!calendarIds || calendarIds.length === 0) {
      return [...this.calendars.entries()].flatMap(([calendarId, calendar]) =>
        calendar.ranges.map(range => ({ calendarId, range })),
      );
    }

    const selectedIds = new Set(calendarIds);
    const entries: CalendarRangeEntry[] = [];

    for (const [calendarId, calendar] of this.calendars.entries()) {
      if (!selectedIds.has(calendarId)) {
        continue;
      }

      entries.push(...calendar.ranges.map(range => ({ calendarId, range })));
    }

    return entries;
  }

  groupRangesByIdAcrossCalendars(calendarIds?: string[]): Map<string, CalendarRangeEntry[]> {
    const grouped = new Map<string, CalendarRangeEntry[]>();

    for (const entry of this.getRangeEntries(calendarIds)) {
      const existing = grouped.get(entry.range.id);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(entry.range.id, [entry]);
      }
    }

    return grouped;
  }

  findRangeCalendar(rangeId: string): string | undefined {
    for (const [calendarId, calendar] of this.calendars.entries()) {
      if (calendar.ranges.some(range => range.id === rangeId)) {
        return calendarId;
      }
    }

    return undefined;
  }

  updateRange(rangeId: string, updates: Partial<DateRange>): boolean {
    for (const calendar of this.calendars.values()) {
      const rangeIndex = calendar.ranges.findIndex(range => range.id === rangeId);
      if (rangeIndex === -1) {
        continue;
      }

      calendar.ranges[rangeIndex] = {
        ...calendar.ranges[rangeIndex],
        ...updates,
      };

      return true;
    }

    return false;
  }

  removeRange(rangeId: string): boolean {
    for (const calendar of this.calendars.values()) {
      const originalLength = calendar.ranges.length;
      calendar.ranges = calendar.ranges.filter(range => range.id !== rangeId);
      if (calendar.ranges.length !== originalLength) {
        return true;
      }
    }

    return false;
  }

  addRange(calendarId: string, range: DateRange): void {
    const calendar = this.calendars.get(calendarId);
    if (calendar) {
      calendar.ranges.push(range);
      return;
    }

    this.calendars.set(calendarId, {
      ranges: [range],
      source: 'ranges',
    });
  }

  getCalendarSummary(): Array<{ id: string; rangeCount: number; labels: string[]; has_more_labels: boolean }> {
    return [...this.calendars.entries()].map(([id, calendar]) => {
      const labels = [...new Set(calendar.ranges.map(range => range.label))];

      return {
        id,
        rangeCount: calendar.ranges.length,
        labels: labels.slice(0, 30),
        has_more_labels: labels.length > 30,
      };
    });
  }
}
