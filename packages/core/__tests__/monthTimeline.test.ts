import { MonthTimeline } from '../src/monthTimeline.js';
import type { DateRange } from '../src/types.js';

function makeRange(overrides: Partial<DateRange>): DateRange {
  return {
    id: 'test-range',
    label: 'Test',
    fixedBetween: true,
    ...overrides,
  };
}

describe('MonthTimeline', () => {
  describe('config validation', () => {
    it('throws if neither numberOfMonths nor endDate is provided', () => {
      expect(() => new MonthTimeline({ startDate: '2026-01-01', ranges: [] })).toThrow(
        'provide numberOfMonths or endDate',
      );
    });

    it('throws if numberOfMonths is less than 1', () => {
      expect(
        () => new MonthTimeline({ startDate: '2026-01-01', numberOfMonths: 0, ranges: [] }),
      ).toThrow('numberOfMonths must be >= 1');
    });

    it('throws if endDate is before startDate after month normalization', () => {
      expect(
        () =>
          new MonthTimeline({
            startDate: '2026-03-15',
            endDate: '2026-02-28',
            ranges: [],
          }),
      ).toThrow('endDate must be on or after startDate');
    });

    it('accepts numberOfMonths only', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-01-01',
        numberOfMonths: 3,
        ranges: [],
      });

      expect(timeline.months).toHaveLength(3);
    });

    it('accepts endDate only', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        ranges: [],
      });

      expect(timeline.months).toHaveLength(3);
    });

    it('uses endDate when both endDate and numberOfMonths are provided', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-01-01',
        numberOfMonths: 12,
        endDate: '2026-04-01',
        ranges: [],
      });

      expect(timeline.months).toHaveLength(4);
    });
  });

  describe('month generation', () => {
    it('generates the correct number of month columns for numberOfMonths', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-15',
        numberOfMonths: 6,
        ranges: [],
      });

      expect(timeline.months).toHaveLength(6);
    });

    it('generates the correct number of month columns from endDate', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-15',
        endDate: '2026-09-02',
        ranges: [],
      });

      expect(timeline.months).toHaveLength(7);
    });

    it('handles year rollover', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-11-15',
        numberOfMonths: 6,
        ranges: [],
      });

      expect(timeline.months.map((month) => [month.year, month.month])).toEqual([
        [2026, 10],
        [2026, 11],
        [2027, 0],
        [2027, 1],
        [2027, 2],
        [2027, 3],
      ]);
    });

    it('normalizes startDate to the first of the month', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-15',
        numberOfMonths: 1,
        ranges: [],
      });

      expect(timeline.months[0].startDate).toBe('2026-03-01');
    });

    it('normalizes endDate to the last day of the month', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-15',
        endDate: '2026-04-02',
        ranges: [],
      });

      expect(timeline.months[1].endDate).toBe('2026-04-30');
    });

    it('populates label and fullLabel', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-01-01',
        numberOfMonths: 1,
        ranges: [],
        locale: 'en-US',
      });

      expect(timeline.months[0]).toMatchObject({
        month: 0,
        label: 'Jan',
        fullLabel: 'January',
      });
    });

    it('sets each column startDate and endDate correctly', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-02-01',
        numberOfMonths: 3,
        ranges: [],
      });

      expect(timeline.months.map((month) => [month.startDate, month.endDate])).toEqual([
        ['2026-02-01', '2026-02-28'],
        ['2026-03-01', '2026-03-31'],
        ['2026-04-01', '2026-04-30'],
      ]);
    });
  });

  describe('span projection', () => {
    it('projects a range covering all months', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-01-01',
        numberOfMonths: 9,
        ranges: [makeRange({ id: 'all', fromDate: '2026-01-01', toDate: '2026-09-30' })],
      });

      expect(timeline.spans[0]).toMatchObject({
        rangeId: 'all',
        startMonthIndex: 0,
        endMonthIndex: 8,
        clippedStart: false,
        clippedEnd: false,
      });
    });

    it('marks clippedStart for a range starting before the window', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 3,
        ranges: [makeRange({ id: 'early', fromDate: '2026-02-01', toDate: '2026-04-15' })],
      });

      expect(timeline.spans[0]).toMatchObject({
        rangeId: 'early',
        startMonthIndex: 0,
        clippedStart: true,
      });
    });

    it('marks clippedEnd for a range ending after the window', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 3,
        ranges: [makeRange({ id: 'late', fromDate: '2026-04-01', toDate: '2026-06-15' })],
      });

      expect(timeline.spans[0]).toMatchObject({
        rangeId: 'late',
        endMonthIndex: 2,
        clippedEnd: true,
      });
    });

    it('projects a single-month range', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 3,
        ranges: [makeRange({ id: 'single', fromDate: '2026-04-10', toDate: '2026-04-20' })],
      });

      expect(timeline.spans[0]).toMatchObject({
        startMonthIndex: 1,
        endMonthIndex: 1,
      });
    });

    it('excludes ranges with no overlap with the window', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 3,
        ranges: [makeRange({ id: 'outside', fromDate: '2026-06-01', toDate: '2026-06-15' })],
      });

      expect(timeline.spans).toEqual([]);
    });

    it('assigns lane 0 to non-overlapping ranges', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 4,
        ranges: [
          makeRange({ id: 'a', fromDate: '2026-03-01', toDate: '2026-03-31' }),
          makeRange({ id: 'b', fromDate: '2026-05-01', toDate: '2026-05-31' }),
        ],
      });

      expect(timeline.spans.map((span) => span.lane)).toEqual([0, 0]);
    });

    it('assigns different lanes to overlapping ranges', () => {
      const timeline = new MonthTimeline({
        startDate: '2026-03-01',
        numberOfMonths: 4,
        ranges: [
          makeRange({ id: 'a', fromDate: '2026-03-01', toDate: '2026-05-31' }),
          makeRange({ id: 'b', fromDate: '2026-04-01', toDate: '2026-06-30' }),
        ],
      });

      expect(new Set(timeline.spans.map((span) => span.lane))).toEqual(new Set([0, 1]));
    });
  });

  describe('getDatePosition', () => {
    const timeline = new MonthTimeline({
      startDate: '2026-03-01',
      numberOfMonths: 3,
      ranges: [],
    });

    it('returns the correct monthIndex and fraction for a date within a column', () => {
      const position = timeline.getDatePosition('2026-04-16');

      expect(position?.monthIndex).toBe(1);
      expect(position?.fraction).toBeGreaterThan(0);
      expect(position?.fraction).toBeLessThan(1);
    });

    it('returns zero fraction for the first day of a month', () => {
      expect(timeline.getDatePosition('2026-04-01')).toEqual({ monthIndex: 1, fraction: 0 });
    });

    it('returns a fraction close to one for the last day of a month', () => {
      expect(timeline.getDatePosition('2026-04-30')).toEqual({
        monthIndex: 1,
        fraction: 29 / 30,
      });
    });

    it('returns null for dates outside the window', () => {
      expect(timeline.getDatePosition('2026-02-28')).toBeNull();
      expect(timeline.getDatePosition('2026-06-01')).toBeNull();
    });
  });

  describe('pregnancy timeline scenario', () => {
    const ranges: DateRange[] = [
      makeRange({ id: 't1', label: 'Trimester 1', fromDate: '2026-01-15', toDate: '2026-04-07' }),
      makeRange({ id: 't2', label: 'Trimester 2', fromDate: '2026-04-08', toDate: '2026-07-14' }),
      makeRange({ id: 't3', label: 'Trimester 3', fromDate: '2026-07-15', toDate: '2026-10-22' }),
      makeRange({
        id: 'postBirth',
        label: 'Post birth',
        fromDate: '2026-10-23',
        toDate: '2027-06-30',
      }),
      makeRange({
        id: 'firstUltrasound',
        label: 'First ultrasound',
        fromDate: '2026-03-05',
        toDate: '2026-03-05',
        displayType: 'dot',
      }),
      makeRange({
        id: 'glucoseTest',
        label: 'Glucose test',
        fromDate: '2026-06-18',
        toDate: '2026-06-18',
        displayType: 'dot',
      }),
      makeRange({
        id: 'birthPrepClass',
        label: 'Birth prep class',
        fromDate: '2026-09-10',
        toDate: '2026-09-10',
        displayType: 'dot',
      }),
    ];

    const timeline = new MonthTimeline({
      startDate: '2026-01-15',
      numberOfMonths: 18,
      ranges,
    });

    it('lays out trimester and post-birth spans at month granularity', () => {
      expect(timeline.spans.find((span) => span.rangeId === 't1')).toMatchObject({
        startMonthIndex: 0,
        endMonthIndex: 3,
        lane: 0,
        clippedStart: false,
      });
      expect(timeline.spans.find((span) => span.rangeId === 't2')).toMatchObject({
        startMonthIndex: 3,
        endMonthIndex: 6,
      });
      expect(timeline.spans.find((span) => span.rangeId === 't3')).toMatchObject({
        startMonthIndex: 6,
        endMonthIndex: 9,
      });
      expect(timeline.spans.find((span) => span.rangeId === 'postBirth')).toMatchObject({
        startMonthIndex: 9,
        endMonthIndex: 17,
      });

      const continuousSpans = timeline.spans.filter((span) =>
        ['t1', 't2', 't3', 'postBirth'].includes(span.rangeId),
      );
      expect(continuousSpans.every((span) => span.lane === 0)).toBe(true);
    });

    it('keeps year-boundary columns correct', () => {
      expect(timeline.months[11]).toMatchObject({ index: 11, year: 2026, month: 11 });
      expect(timeline.months[12]).toMatchObject({ index: 12, year: 2027, month: 0 });
      expect(timeline.spans.find((span) => span.rangeId === 'postBirth')?.endMonthIndex).toBe(17);
    });

    it('places milestone dots in the right month columns', () => {
      const firstUltrasound = timeline.getDatePosition('2026-03-05');

      expect(firstUltrasound?.monthIndex).toBe(2);
      expect(firstUltrasound?.fraction).toBeGreaterThan(0);
      expect(firstUltrasound?.fraction).toBeLessThan(1);
      expect(timeline.getDatePosition('2026-06-18')?.monthIndex).toBe(5);
      expect(timeline.getDatePosition('2026-09-10')?.monthIndex).toBe(8);
      expect(timeline.getDatePosition('2026-10-22')?.monthIndex).toBe(9);
      expect(timeline.getDatePosition('2027-01-01')?.monthIndex).toBe(12);
      expect(timeline.getDatePosition('2024-06-01')).toBeNull();
      expect(timeline.getDatePosition('2028-01-01')).toBeNull();
    });
  });
});
