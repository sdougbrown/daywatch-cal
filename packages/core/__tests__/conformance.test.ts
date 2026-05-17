import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RangeEvaluator, scoreSchedule } from '../src/index.js';
import type { DateRange } from '../src/index.js';

type Fixture = {
  description: string;
  userTimezone?: string;
  range?: DateRange;
  ranges?: DateRange[];
  isDateInRange?: {
    date: string;
    expected: boolean;
    rangeId?: string;
  }[];
  expand?: {
    from: string;
    to: string;
    expectedDates: string[];
  }[];
  timeSlots?: {
    date: string;
    expected: {
      startTime: string;
      endTime?: string | null;
      duration?: number | null;
    }[];
  }[];
  findConflicts?: {
    date: string;
    expected: ReturnType<RangeEvaluator['findConflicts']>;
  }[];
  findFreeSlots?: {
    date: string;
    options: {
      dayStart?: string;
      dayEnd?: string;
      minDuration?: number;
    };
    expected: ReturnType<RangeEvaluator['findFreeSlots']>;
  }[];
  scoreSchedule?: {
    from: string;
    to: string;
    options: {
      dayStart?: string;
      dayEnd?: string;
      focusBlockMinutes?: number;
    };
    expected: ReturnType<typeof scoreSchedule>;
  }[];
};

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'conformance',
  'fixtures',
);

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return fixtureFiles(path);
      return path.endsWith('.json') ? [path] : [];
    })
    .sort();
}

function localDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

describe('shared conformance fixtures', () => {
  for (const file of fixtureFiles(fixturesDir)) {
    const fixture = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
    const label = file.slice(fixturesDir.length + 1);

    it(label, () => {
      const evaluator = new RangeEvaluator(fixture.userTimezone);

      if (fixture.isDateInRange) {
        if (fixture.range) {
          for (const assertion of fixture.isDateInRange) {
            expect(evaluator.isDateInRange(assertion.date, fixture.range)).toBe(assertion.expected);
          }
        } else if (fixture.ranges) {
          const rangesById = new Map(fixture.ranges.map((range) => [range.id, range]));
          for (const assertion of fixture.isDateInRange) {
            const range = rangesById.get(assertion.rangeId ?? '');
            expect(range, `range ${assertion.rangeId} must exist`).toBeDefined();
            expect(evaluator.isDateInRange(assertion.date, range!)).toBe(assertion.expected);
          }
        }
      }

      if (fixture.expand) {
        expect(fixture.range).toBeDefined();
        for (const assertion of fixture.expand) {
          expect(
            evaluator
              .expand(fixture.range!, localDate(assertion.from), localDate(assertion.to))
              .map((occurrence) => occurrence.date),
          ).toEqual(assertion.expectedDates);
        }
      }

      if (fixture.timeSlots) {
        expect(fixture.range).toBeDefined();
        for (const assertion of fixture.timeSlots) {
          expect(
            evaluator.getTimeSlots(assertion.date, fixture.range!).map((slot) => ({
              startTime: slot.startTime,
              endTime: slot.endTime,
              duration: slot.duration,
            })),
          ).toEqual(
            assertion.expected.map((slot) => ({
              startTime: slot.startTime,
              endTime: slot.endTime ?? null,
              duration: slot.duration ?? null,
            })),
          );
        }
      }

      if (fixture.findConflicts) {
        expect(fixture.ranges).toBeDefined();
        for (const assertion of fixture.findConflicts) {
          expect(evaluator.findConflicts(fixture.ranges!, assertion.date)).toEqual(
            assertion.expected,
          );
        }
      }

      if (fixture.findFreeSlots) {
        expect(fixture.ranges).toBeDefined();
        for (const assertion of fixture.findFreeSlots) {
          expect(
            evaluator.findFreeSlots(fixture.ranges!, assertion.date, assertion.options),
          ).toEqual(assertion.expected);
        }
      }

      if (fixture.scoreSchedule) {
        expect(fixture.ranges).toBeDefined();
        for (const assertion of fixture.scoreSchedule) {
          expect(
            scoreSchedule(
              evaluator,
              fixture.ranges!,
              localDate(assertion.from),
              localDate(assertion.to),
              assertion.options,
            ),
          ).toEqual(assertion.expected);
        }
      }
    });
  }
});
