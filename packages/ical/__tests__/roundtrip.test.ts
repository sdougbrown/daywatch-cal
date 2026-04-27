import { readFileSync } from 'node:fs';

import type { DateRange } from '@daywatch/cal';

import { generateICS } from '../src/generate.js';
import { parseICS } from '../src/parse.js';

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

function makeWindow(from: string, to: string): { from: Date; to: Date } {
  return {
    from: new Date(`${from}T00:00:00`),
    to: new Date(`${to}T00:00:00`),
  };
}

function normalizeRange(range: DateRange): DateRange {
  return {
    ...range,
    dates: range.dates ? [...range.dates].sort() : undefined,
    exceptDates: range.exceptDates ? [...range.exceptDates].sort() : undefined,
    everyDate: range.everyDate ? [...range.everyDate].sort((a, b) => a - b) : undefined,
    everyWeekday: range.everyWeekday ? [...range.everyWeekday].sort((a, b) => a - b) : undefined,
    everyMonth: range.everyMonth ? [...range.everyMonth].sort((a, b) => a - b) : undefined,
  };
}

function normalizeRanges(ranges: DateRange[]): DateRange[] {
  return [...ranges].map(normalizeRange).sort((a, b) => a.id.localeCompare(b.id));
}

describe('parse/generate roundtrip', () => {
  it('preserves parsed DateRange structures across export and re-import', () => {
    const window = makeWindow('2026-01-01', '2027-01-31');
    const sourceRanges = [
      ...parseICS(loadFixture('simple-events.ics'), window),
      ...parseICS(loadFixture('recurring-weekly.ics'), window),
      ...parseICS(loadFixture('recurring-monthly.ics'), window),
      ...parseICS(loadFixture('google-export.ics'), window),
    ];

    const roundTripped = parseICS(generateICS(sourceRanges, { calendarName: 'Roundtrip' }), window);

    expect(normalizeRanges(roundTripped)).toEqual(normalizeRanges(sourceRanges));
  });
});
