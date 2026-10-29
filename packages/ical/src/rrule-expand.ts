import * as rrulePkg from 'rrule';

import { compareDates, pad } from './utils.js';

// rrule 2.8.1 ships no `exports` map and its types declare no default export,
// so the two runtimes disagree: Node's CJS interop exposes `rrulestr` only on
// the namespace's `default`, while Bun's strict resolver (including
// `bun build --compile`, which loads the package's ESM build) exposes it as a
// namespace named export. Take whichever one the runtime provides. The access
// to `default` goes through a helper so Bun's bundler does not warn about the
// branch it can prove dead.
const pickDefaultExport = (ns: unknown): unknown => (ns as { default?: unknown }).default;
const rruleModule =
  'rrulestr' in rrulePkg
    ? rrulePkg
    : (pickDefaultExport(rrulePkg) as { rrulestr: (typeof rrulePkg)['rrulestr'] });

const { rrulestr } = rruleModule;

interface ParseWindow {
  from: Date;
  to: Date;
}

interface ExpandOptions {
  dtstartIsDate?: boolean;
  dtstartIsUTC?: boolean;
}

function getDateParts(date: Date, useUTC: boolean): { year: number; month: number; day: number } {
  if (useUTC) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getTimeParts(
  date: Date,
  useUTC: boolean,
): { hour: number; minute: number; second: number } {
  if (useUTC) {
    return {
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }

  return {
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}${pad(month)}${pad(day)}`;
}

function formatExpandedDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatDtstart(
  date: Date,
  { dtstartIsDate = false, dtstartIsUTC = false }: ExpandOptions = {},
): string {
  const dateParts = getDateParts(date, dtstartIsUTC);
  const formattedDate = formatDateParts(dateParts.year, dateParts.month, dateParts.day);

  if (dtstartIsDate) {
    return formattedDate;
  }

  const timeParts = getTimeParts(date, dtstartIsUTC);
  const formattedTime = `${pad(timeParts.hour)}${pad(timeParts.minute)}${pad(timeParts.second)}`;

  return dtstartIsUTC ? `${formattedDate}T${formattedTime}Z` : `${formattedDate}T${formattedTime}`;
}

function getSearchWindow(window: ParseWindow): ParseWindow {
  const from = new Date(window.from);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 1);

  const to = new Date(window.to);
  to.setHours(23, 59, 59, 999);
  to.setDate(to.getDate() + 1);

  return { from, to };
}

export function expandRRuleToExplicitDates(
  rruleString: string,
  dtstart: Date,
  window: ParseWindow,
  options?: ExpandOptions,
): string[] {
  const rule = rrulestr(`DTSTART:${formatDtstart(dtstart, options)}\nRRULE:${rruleString}`);
  const searchWindow = getSearchWindow(window);
  const windowFrom = formatExpandedDate(window.from);
  const windowTo = formatExpandedDate(window.to);

  const dates = rule.between(searchWindow.from, searchWindow.to, true);
  const expandedDates = new Set<string>();

  for (const date of dates) {
    const formattedDate = formatExpandedDate(date);
    if (
      compareDates(formattedDate, windowFrom) >= 0 &&
      compareDates(formattedDate, windowTo) <= 0
    ) {
      expandedDates.add(formattedDate);
    }
  }

  return [...expandedDates].sort();
}
