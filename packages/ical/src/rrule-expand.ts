import rrulePkg from 'rrule';

const { rrulestr } = rrulePkg;

interface ParseWindow {
  from: Date;
  to: Date;
}

interface ExpandOptions {
  dtstartIsDate?: boolean;
  dtstartIsUTC?: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
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

function getTimeParts(date: Date, useUTC: boolean): { hour: number; minute: number; second: number } {
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

function formatDtstart(date: Date, { dtstartIsDate = false, dtstartIsUTC = false }: ExpandOptions = {}): string {
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

function compareDates(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
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
    if (compareDates(formattedDate, windowFrom) >= 0 && compareDates(formattedDate, windowTo) <= 0) {
      expandedDates.add(formattedDate);
    }
  }

  return [...expandedDates].sort();
}
