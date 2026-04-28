import { RangeEvaluator } from '../src/evaluator.js';
import type { DateRange } from '../src/types.js';

const evaluator = new RangeEvaluator('UTC');

function makeRange(overrides: Partial<DateRange>): DateRange {
  return {
    id: 'test-range',
    label: 'Test',
    ...overrides,
  };
}

describe('computeSpans', () => {
  it('single range spanning 5 days → one SpanInfo with length 5, lane 0, maxOverlap 1', () => {
    const range = makeRange({
      id: 'r1',
      label: 'Vacation',
      fromDate: '2026-03-23',
      toDate: '2026-03-27',
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 23), new Date(2026, 2, 27));

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      rangeId: 'r1',
      label: 'Vacation',
      startDate: '2026-03-23',
      endDate: '2026-03-27',
      length: 5,
      lane: 0,
      maxOverlap: 1,
      totalLanes: 1,
    });
  });

  it('two non-overlapping ranges → both get lane 0', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'A',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'B',
      fromDate: '2026-03-27',
      toDate: '2026-03-29',
    });

    const spans = evaluator.computeSpans(
      [rangeA, rangeB],
      new Date(2026, 2, 23),
      new Date(2026, 2, 29),
    );

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      rangeId: 'a',
      lane: 0,
      maxOverlap: 1,
      totalLanes: 1,
    });
    expect(spans[1]).toMatchObject({
      rangeId: 'b',
      lane: 0,
      maxOverlap: 1,
      totalLanes: 1,
    });
  });

  it('two overlapping ranges (same days) → different lanes, maxOverlap 2, totalLanes 2', () => {
    const rangeA = makeRange({
      id: 'a',
      label: 'A',
      fromDate: '2026-03-23',
      toDate: '2026-03-27',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'B',
      fromDate: '2026-03-23',
      toDate: '2026-03-27',
    });

    const spans = evaluator.computeSpans(
      [rangeA, rangeB],
      new Date(2026, 2, 23),
      new Date(2026, 2, 27),
    );

    expect(spans).toHaveLength(2);

    const lanesUsed = new Set(spans.map((s) => s.lane));
    expect(lanesUsed.size).toBe(2);
    expect(lanesUsed).toContain(0);
    expect(lanesUsed).toContain(1);

    for (const span of spans) {
      expect(span.maxOverlap).toBe(2);
      expect(span.totalLanes).toBe(2);
    }
  });

  it('three ranges with partial overlap → correct lane assignment', () => {
    // A: Mar 23-27 (Mon-Fri)
    // B: Mar 25-29 (Wed-Sun) — overlaps with A on 25-27
    // C: Mar 30-31 (Mon-Tue) — no overlap
    const rangeA = makeRange({
      id: 'a',
      label: 'A',
      fromDate: '2026-03-23',
      toDate: '2026-03-27',
    });
    const rangeB = makeRange({
      id: 'b',
      label: 'B',
      fromDate: '2026-03-25',
      toDate: '2026-03-29',
    });
    const rangeC = makeRange({
      id: 'c',
      label: 'C',
      fromDate: '2026-03-30',
      toDate: '2026-03-31',
    });

    const spans = evaluator.computeSpans(
      [rangeA, rangeB, rangeC],
      new Date(2026, 2, 23),
      new Date(2026, 2, 31),
    );

    expect(spans).toHaveLength(3);

    const spanA = spans.find((s) => s.rangeId === 'a')!;
    const spanB = spans.find((s) => s.rangeId === 'b')!;
    const spanC = spans.find((s) => s.rangeId === 'c')!;

    // A and B overlap, so they must have different lanes
    expect(spanA.lane).not.toBe(spanB.lane);

    // A and B have maxOverlap 2 (they overlap on Mar 25-27)
    expect(spanA.maxOverlap).toBe(2);
    expect(spanB.maxOverlap).toBe(2);

    // A and B are in the same overlap group, totalLanes = 2
    expect(spanA.totalLanes).toBe(2);
    expect(spanB.totalLanes).toBe(2);

    // C has no overlap
    expect(spanC.maxOverlap).toBe(1);
    expect(spanC.totalLanes).toBe(1);
  });

  it('range with gaps (Mon/Wed/Fri via everyWeekday) → multiple SpanInfos, each 1 day', () => {
    // 2026-03-23 is Monday, 2026-03-27 is Friday
    const range = makeRange({
      id: 'mwf',
      label: 'MWF',
      everyWeekday: [1, 3, 5], // Mon, Wed, Fri
      fromDate: '2026-03-23',
      toDate: '2026-03-27',
      fixedBetween: true,
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 23), new Date(2026, 2, 27));

    // Mon(23), Wed(25), Fri(27) — three separate 1-day spans
    expect(spans).toHaveLength(3);
    expect(spans[0]).toMatchObject({
      startDate: '2026-03-23',
      endDate: '2026-03-23',
      length: 1,
    });
    expect(spans[1]).toMatchObject({
      startDate: '2026-03-25',
      endDate: '2026-03-25',
      length: 1,
    });
    expect(spans[2]).toMatchObject({
      startDate: '2026-03-27',
      endDate: '2026-03-27',
      length: 1,
    });

    // All from same range
    for (const span of spans) {
      expect(span.rangeId).toBe('mwf');
      expect(span.lane).toBe(0);
      expect(span.maxOverlap).toBe(1);
    }
  });

  it('empty ranges → empty result', () => {
    const spans = evaluator.computeSpans([], new Date(2026, 2, 23), new Date(2026, 2, 27));

    expect(spans).toHaveLength(0);
  });

  it('range outside the query window → empty result', () => {
    const range = makeRange({
      id: 'r1',
      fromDate: '2026-04-01',
      toDate: '2026-04-05',
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 23), new Date(2026, 2, 27));

    expect(spans).toHaveLength(0);
  });

  it('passes through displayType from the range', () => {
    const range = makeRange({
      id: 'r1',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
      displayType: 'chip',
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 23), new Date(2026, 2, 25));

    expect(spans).toHaveLength(1);
    expect(spans[0].displayType).toBe('chip');
  });

  it('omits displayType when not set on range', () => {
    const range = makeRange({
      id: 'r1',
      fromDate: '2026-03-23',
      toDate: '2026-03-25',
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 23), new Date(2026, 2, 25));

    expect(spans).toHaveLength(1);
    expect(spans[0]).not.toHaveProperty('displayType');
  });

  it('results are sorted by startDate then lane', () => {
    const ranges = [
      makeRange({
        id: 'late',
        label: 'Late',
        fromDate: '2026-03-26',
        toDate: '2026-03-28',
      }),
      makeRange({
        id: 'early',
        label: 'Early',
        fromDate: '2026-03-23',
        toDate: '2026-03-25',
      }),
    ];

    const spans = evaluator.computeSpans(ranges, new Date(2026, 2, 23), new Date(2026, 2, 28));

    expect(spans[0].rangeId).toBe('early');
    expect(spans[1].rangeId).toBe('late');
  });

  it('three ranges all overlapping on the same day → 3 lanes', () => {
    const ranges = [
      makeRange({
        id: 'a',
        label: 'A',
        fromDate: '2026-03-25',
        toDate: '2026-03-25',
      }),
      makeRange({
        id: 'b',
        label: 'B',
        fromDate: '2026-03-25',
        toDate: '2026-03-25',
      }),
      makeRange({
        id: 'c',
        label: 'C',
        fromDate: '2026-03-25',
        toDate: '2026-03-25',
      }),
    ];

    const spans = evaluator.computeSpans(ranges, new Date(2026, 2, 25), new Date(2026, 2, 25));

    expect(spans).toHaveLength(3);
    const lanesUsed = new Set(spans.map((s) => s.lane));
    expect(lanesUsed.size).toBe(3);

    for (const span of spans) {
      expect(span.maxOverlap).toBe(3);
      expect(span.totalLanes).toBe(3);
    }
  });

  it('window clips range to visible portion', () => {
    const range = makeRange({
      id: 'r1',
      fromDate: '2026-03-20',
      toDate: '2026-03-30',
    });

    const spans = evaluator.computeSpans([range], new Date(2026, 2, 25), new Date(2026, 2, 27));

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      startDate: '2026-03-25',
      endDate: '2026-03-27',
      length: 3,
    });
  });
});
