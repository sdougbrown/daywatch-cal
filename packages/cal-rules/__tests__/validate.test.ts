import {
  validateRangeCreate,
  validateRangePatch,
  validateRanges,
} from '../src/index.js';

describe('@daywatch/cal-rules', () => {
  test('accepts a valid create payload', () => {
    const input = {
      id: 'r1',
      label: 'Morning block',
      fromDate: '2026-04-01',
      toDate: '2026-04-02',
      startTime: '09:00',
      endTime: '10:00',
    };

    const result = validateRangeCreate(input);

    expect(result.ok).toBe(true);
    expect(result.candidate).toEqual(input);
    expect(result.issues).toEqual([]);
  });

  test('sanitizes unknown keys in lenient mode', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Strict',
      extra: true,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.candidate).toEqual({ id: 'r1', label: 'Strict' });
  });

  test('flags missing id', () => {
    const result = validateRangeCreate({ label: 'Missing ID' });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'required' && issue.field === 'id',
      ),
    ).toBe(true);
  });

  test('flags everyHour/startTime conflict', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Conflict',
      everyHour: [9],
      startTime: '09:00',
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.field === 'everyHour' && issue.code === 'disabled',
      ),
    ).toBe(true);
  });

  test('flags endTime and repeatEvery when startTime is missing', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Deps',
      endTime: '10:00',
      repeatEvery: 30,
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.field === 'endTime' && issue.code === 'disabled',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.field === 'repeatEvery' && issue.code === 'disabled',
      ),
    ).toBe(true);
  });

  test('flags toDate before fromDate as foul', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Ordering',
      fromDate: '2026-04-10',
      toDate: '2026-04-01',
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.field === 'toDate' &&
          issue.code === 'foul' &&
          issue.message === 'toDate must be on or after fromDate',
      ),
    ).toBe(true);
  });

  test('flags invalid date and time', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Invalid',
      fromDate: '2026-13-01',
      startTime: '25:00',
      endTime: '24:30',
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'fromDate',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'startTime',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'endTime',
      ),
    ).toBe(true);
  });

  test('flags invalid timezone/displayType/flexibility', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Types',
      timezone: 'Not/A_Real Timezone',
      displayType: ['auto'],
      flexibility: 99,
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'timezone',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'displayType',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'flexibility',
      ),
    ).toBe(true);
  });

  test('flags invalid fixedBetween/title/metadata types', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Shape',
      fixedBetween: 'yes',
      title: 123,
      metadata: [],
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'fixedBetween',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'title',
      ),
    ).toBe(true);
    expect(
      result.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === 'metadata',
      ),
    ).toBe(true);
  });

  test('includes foul issues on patch transitions', () => {
    const existing = {
      id: 'r1',
      label: 'Patch',
      startTime: '09:00',
      endTime: '10:00',
    };

    const result = validateRangePatch(existing, { everyHour: [9] });

    expect(result.ok).toBe(false);
    expect(result.candidate).toEqual({
      id: 'r1',
      label: 'Patch',
      startTime: '09:00',
      endTime: '10:00',
      everyHour: [9],
    });
    expect(
      result.issues.some(
        (issue) =>
          issue.code === 'disabled' &&
          issue.field === 'everyHour' &&
          issue.message ===
            'everyHour is mutually exclusive with startTime/endTime/repeatEvery',
      ),
    ).toBe(true);
  });

  test('flags unknown keys in strict mode for patches', () => {
    const result = validateRangePatch(
      { id: 'r1', label: 'Patch' },
      { extra: true },
      { mode: 'strict' },
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'unknown_key' && issue.field === '$',
      ),
    ).toBe(true);
  });

  test('flags unknown keys in strict mode', () => {
    const result = validateRangeCreate(
      {
        id: 'r1',
        label: 'Strict',
        extra: true,
      },
      { mode: 'strict' },
    );

    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === 'unknown_key' && issue.field === '$',
      ),
    ).toBe(true);
  });

  test('handles non-object create/patch inputs safely', () => {
    const createResult = validateRangeCreate(null);
    const patchResult = validateRangePatch(null, 'nope');

    expect(createResult.ok).toBe(false);
    expect(
      createResult.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === '$',
      ),
    ).toBe(true);
    expect(patchResult.ok).toBe(false);
    expect(
      patchResult.issues.some(
        (issue) => issue.code === 'invalid' && issue.field === '$',
      ),
    ).toBe(true);
  });

  test('returns indexed results for validateRanges', () => {
    const results = validateRanges([
      { id: 'r1', label: 'Good' },
      { label: 'Missing ID' },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].index).toBe(1);
    expect(
      results[1].issues.some(
        (issue) => issue.code === 'required' && issue.field === 'id',
      ),
    ).toBe(true);
  });

  test('handles non-array validateRanges input safely', () => {
    const results = validateRanges('not an array');

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(
      results[0].issues.some(
        (issue) => issue.code === 'invalid' && issue.field === '$',
      ),
    ).toBe(true);
  });
});
