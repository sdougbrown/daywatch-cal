import { performance } from 'node:perf_hooks';
import {
  RangeEvaluator,
  CalendarGrid,
  YearGrid,
  scoreSchedule,
  dateRange,
} from '../dist/index.js';

const userTimezone = 'America/Toronto';

function benchmark(name, iterations, fn) {
  let checksum = 0;

  for (let i = 0; i < 1; i++) {
    checksum += fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    checksum += fn();
  }
  const totalMs = performance.now() - start;

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: (iterations * 1000) / totalMs,
    checksum,
  };
}

function printResults(results) {
  const table = results.map(result => ({
    benchmark: result.name,
    iterations: result.iterations,
    total_ms: result.totalMs.toFixed(2),
    avg_ms: result.avgMs.toFixed(3),
    ops_sec: result.opsPerSec.toFixed(2),
    checksum: result.checksum,
  }));

  console.table(table);
}

function makeDayRanges(count) {
  return Array.from({ length: count }, (_, index) => {
    const fromMonth = (index % 6) + 1;
    const toMonth = Math.min(fromMonth + 5, 12);
    const dayOfMonth = (index % 28) + 1;
    const weekday = index % 7;
    const altWeekday = (weekday + 2) % 7;

    return {
      id: `day-${index}`,
      label: `Day ${index}`,
      fromDate: `2026-${String(fromMonth).padStart(2, '0')}-01`,
      toDate: `2026-${String(toMonth).padStart(2, '0')}-28`,
      fixedBetween: true,
      everyWeekday: [weekday, altWeekday],
      everyDate: [dayOfMonth],
      everyMonth: [fromMonth, ((fromMonth + 2 - 1) % 12) + 1],
      exceptDates: [`2026-${String(fromMonth).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`],
      exceptBetween: [[`2026-${String(fromMonth).padStart(2, '0')}-10`, `2026-${String(fromMonth).padStart(2, '0')}-12`]],
    };
  });
}

function makeTimedRanges(count, timezone) {
  return Array.from({ length: count }, (_, index) => {
    const month = (index % 12) + 1;
    const startHour = 6 + (index % 8);
    const repeatEvery = index % 3 === 0 ? 180 : undefined;
    const duration = 30 + ((index % 4) * 15);

    if (index % 2 === 0) {
      return {
        id: `timed-${index}`,
        label: `Timed ${index}`,
        fromDate: `2026-${String(month).padStart(2, '0')}-01`,
        toDate: `2026-${String(month).padStart(2, '0')}-28`,
        fixedBetween: true,
        everyWeekday: [1, 2, 3, 4, 5],
        startTime: `${String(startHour).padStart(2, '0')}:00`,
        endTime: `${String(Math.min(startHour + 8, 23)).padStart(2, '0')}:00`,
        repeatEvery,
        duration,
        timezone,
      };
    }

    return {
      id: `timed-${index}`,
      label: `Timed ${index}`,
      fromDate: `2026-${String(month).padStart(2, '0')}-01`,
      toDate: `2026-${String(month).padStart(2, '0')}-28`,
      fixedBetween: true,
      everyWeekday: [1, 3, 5],
      everyHour: [startHour, Math.min(startHour + 4, 23), Math.min(startHour + 8, 23)],
      duration,
      timezone,
    };
  });
}

function makeExplicitDateRanges(count) {
  return Array.from({ length: count }, (_, index) => {
    const dates = [];
    for (let i = 0; i < 12; i++) {
      const month = ((index + i) % 12) + 1;
      const day = ((index * 3 + i * 5) % 28) + 1;
      dates.push(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }

    return {
      id: `explicit-${index}`,
      label: `Explicit ${index}`,
      dates,
      exceptDates: [dates[0]],
    };
  });
}

const evaluator = new RangeEvaluator(userTimezone);
const dayRanges = makeDayRanges(160);
const explicitRanges = makeExplicitDateRanges(80);
const timedRanges = makeTimedRanges(48, userTimezone);
const utcTimedRanges = makeTimedRanges(32, 'UTC');
const allRanges = [...dayRanges, ...explicitRanges, ...timedRanges];
const allTimedRanges = [...timedRanges, ...utcTimedRanges];
const allDayCheckingRanges = [...dayRanges, ...explicitRanges];
const yearlyDates = dateRange('2026-01-01', '2026-12-31');
const springDates = dateRange('2026-03-01', '2026-05-31');
const marchDates = dateRange('2026-03-01', '2026-03-30');

const results = [
  benchmark('isDateInRange/year-window', 5, () => {
    let matches = 0;
    for (const date of yearlyDates) {
      for (const range of allDayCheckingRanges) {
        if (evaluator.isDateInRange(date, range)) {
          matches++;
        }
      }
    }
    return matches;
  }),
  benchmark('getTimeSlots/timezone-window', 10, () => {
    let slots = 0;
    for (const date of springDates) {
      for (const range of allTimedRanges) {
        if (!evaluator.isDateInRange(date, range)) continue;
        slots += evaluator.getTimeSlots(date, range).length;
      }
    }
    return slots;
  }),
  benchmark('calendarGrid/day-fidelity', 20, () => {
    const grid = new CalendarGrid({
      focusDate: '2026-03-15',
      numberOfMonths: 6,
      ranges: allRanges,
      fidelity: 'day',
      userTimezone,
    });

    return grid.months.reduce(
      (sum, month) => sum + month.weeks.reduce((weekSum, week) => weekSum + week.days.length, 0),
      0,
    );
  }),
  benchmark('yearGrid/full-year', 10, () => {
    const grid = new YearGrid({
      year: 2026,
      ranges: [...dayRanges, ...explicitRanges],
      userTimezone,
    });

    return grid.months.reduce((sum, month) => sum + month.activeDays, 0);
  }),
  benchmark('findConflictsInWindow/30-days', 15, () => {
    return evaluator.findConflictsInWindow(
      allTimedRanges,
      new Date('2026-03-01T00:00:00'),
      new Date('2026-03-30T00:00:00'),
    ).length;
  }),
  benchmark('findFreeSlots/30-days', 10, () => {
    let slots = 0;
    for (const date of marchDates) {
      slots += evaluator.findFreeSlots(allTimedRanges, date, {
        minDuration: 30,
        dayStart: '08:00',
        dayEnd: '18:00',
      }).length;
    }
    return slots;
  }),
  benchmark('scoreSchedule/30-days', 10, () => {
    const score = scoreSchedule(
      evaluator,
      allTimedRanges,
      new Date('2026-03-01T00:00:00'),
      new Date('2026-03-30T00:00:00'),
      {
        focusBlockMinutes: 90,
        dayStart: '08:00',
        dayEnd: '18:00',
      },
    );

    return score.conflicts + score.freeMinutes + score.focusBlocks + score.conflictDays;
  }),
];

printResults(results);
