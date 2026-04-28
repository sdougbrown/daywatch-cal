import { validateRangeCreate, validateRangePatch, validateRanges } from '../src/index.js';

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

  test('accepts endTime and repeatEvery when startTime is present', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Interval',
      startTime: '09:00',
      endTime: '10:00',
      repeatEvery: 30,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('accepts endTime boundary at 24:00', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Boundary',
      startTime: '23:00',
      endTime: '24:00',
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('accepts valid metadata object', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Metadata',
      metadata: { key: 'value' },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('accepts duration with everyHour strategy', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Hourly duration',
      everyHour: [9, 13],
      duration: 30,
    });

    expect(result.ok).toBe(true);
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
    expect(result.issues).toHaveLength(1);
    expect(result.issues.some((issue) => issue.code === 'required' && issue.field === 'id')).toBe(
      true,
    );
  });

  test('flags missing label and whitespace-only required strings', () => {
    const missingLabel = validateRangeCreate({ id: 'r1' });
    const whitespaceValues = validateRangeCreate({ id: '   ', label: '   ' });

    expect(missingLabel.ok).toBe(false);
    expect(missingLabel.issues).toHaveLength(1);
    expect(
      missingLabel.issues.some((issue) => issue.code === 'required' && issue.field === 'label'),
    ).toBe(true);

    expect(whitespaceValues.ok).toBe(false);
    expect(whitespaceValues.issues).toHaveLength(2);
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
      result.issues.some((issue) => issue.field === 'everyHour' && issue.code === 'disabled'),
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
      result.issues.some((issue) => issue.field === 'endTime' && issue.code === 'disabled'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.field === 'repeatEvery' && issue.code === 'disabled'),
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

  test('accepts toDate equal to fromDate', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Same Day',
      fromDate: '2026-04-01',
      toDate: '2026-04-01',
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
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
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'fromDate'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'startTime'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'endTime'),
    ).toBe(true);
  });

  test('flags impossible calendar dates', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Calendar Day',
      fromDate: '2026-02-30',
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'fromDate'),
    ).toBe(true);
  });

  test('validates list boundaries for recurrence arrays', () => {
    const valid = validateRangeCreate({
      id: 'r1',
      label: 'List bounds',
      everyDate: [1, 31],
      everyWeekday: [0, 6],
      everyMonth: [1, 12],
      everyHour: [0, 23],
    });

    const invalid = validateRangeCreate({
      id: 'r1',
      label: 'List bounds invalid',
      everyDate: [0, 32],
      everyWeekday: [-1, 7],
      everyMonth: [0, 13],
      everyHour: [-1, 24],
    });

    expect(valid.ok).toBe(true);
    expect(valid.issues).toEqual([]);

    expect(invalid.ok).toBe(false);
    expect(invalid.issues.some((issue) => issue.field === 'everyDate')).toBe(true);
    expect(invalid.issues.some((issue) => issue.field === 'everyWeekday')).toBe(true);
    expect(invalid.issues.some((issue) => issue.field === 'everyMonth')).toBe(true);
    expect(invalid.issues.some((issue) => issue.field === 'everyHour')).toBe(true);
  });

  test('validates dates, exceptDates, and exceptBetween', () => {
    const valid = validateRangeCreate({
      id: 'r1',
      label: 'Date arrays',
      dates: ['2026-04-01'],
      exceptDates: ['2026-04-02'],
      exceptBetween: [['2026-04-03', '2026-04-05']],
    });

    const invalid = validateRangeCreate({
      id: 'r1',
      label: 'Date arrays invalid',
      dates: ['bad'],
      exceptDates: ['2026-02-30'],
      exceptBetween: [['2026-04-10', '2026-04-01']],
    });

    expect(valid.ok).toBe(true);
    expect(valid.issues).toEqual([]);

    expect(invalid.ok).toBe(false);
    expect(invalid.issues.some((issue) => issue.field === 'dates')).toBe(true);
    expect(invalid.issues.some((issue) => issue.field === 'exceptDates')).toBe(true);
    expect(invalid.issues.some((issue) => issue.field === 'exceptBetween')).toBe(true);
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
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'timezone'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'displayType'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'flexibility'),
    ).toBe(true);
  });

  test('accepts flexibility boundaries 0 and 5', () => {
    const low = validateRangeCreate({ id: 'r1', label: 'Low', flexibility: 0 });
    const high = validateRangeCreate({
      id: 'r1',
      label: 'High',
      flexibility: 5,
    });

    expect(low.ok).toBe(true);
    expect(high.ok).toBe(true);
  });

  test('rejects repeatEvery/duration zero', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Zero',
      startTime: '09:00',
      repeatEvery: 0,
      duration: 0,
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'repeatEvery'),
    ).toBe(true);
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'duration'),
    ).toBe(true);
  });

  test('flags duration without everyHour or startTime', () => {
    const result = validateRangeCreate({
      id: 'r1',
      label: 'Duration only',
      duration: 30,
    });

    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'disabled' && issue.field === 'duration'),
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
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'fixedBetween'),
    ).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'title')).toBe(
      true,
    );
    expect(
      result.issues.some((issue) => issue.code === 'invalid' && issue.field === 'metadata'),
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
          issue.message === 'everyHour is mutually exclusive with startTime/endTime/repeatEvery',
      ),
    ).toBe(true);
  });

  test('accepts valid patch payload', () => {
    const result = validateRangePatch(
      { id: 'r1', label: 'Patch', startTime: '09:00' },
      { endTime: '10:00', repeatEvery: 30 },
    );

    expect(result.ok).toBe(true);
    expect(result.candidate).toEqual({
      id: 'r1',
      label: 'Patch',
      startTime: '09:00',
      endTime: '10:00',
      repeatEvery: 30,
    });
  });

  test('flags unknown keys in strict mode for patches', () => {
    const result = validateRangePatch(
      { id: 'r1', label: 'Patch' },
      { extra: true },
      { mode: 'strict' },
    );

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'unknown_key' && issue.field === '$')).toBe(
      true,
    );
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
    expect(result.issues.some((issue) => issue.code === 'unknown_key' && issue.field === '$')).toBe(
      true,
    );
  });

  test('handles non-object create/patch inputs safely', () => {
    const createResult = validateRangeCreate(null);
    const patchResult = validateRangePatch(null, 'nope');

    expect(createResult.ok).toBe(false);
    expect(
      createResult.issues.some((issue) => issue.code === 'invalid' && issue.field === '$'),
    ).toBe(true);
    expect(patchResult.ok).toBe(false);
    expect(patchResult.issues).toHaveLength(2);
    expect(
      patchResult.issues.some((issue) => issue.code === 'invalid' && issue.field === '$'),
    ).toBe(true);
  });

  test('returns indexed results for validateRanges', () => {
    const results = validateRanges([{ id: 'r1', label: 'Good' }, { label: 'Missing ID' }]);

    expect(results).toHaveLength(2);
    expect(results[0].index).toBe(0);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].index).toBe(1);
    expect(
      results[1].issues.some((issue) => issue.code === 'required' && issue.field === 'id'),
    ).toBe(true);
  });

  test('handles non-array validateRanges input safely', () => {
    const results = validateRanges('not an array');

    expect(results).toHaveLength(1);
    expect(results[0].index).toBe(-1);
    expect(results[0].ok).toBe(false);
    expect(results[0].issues.some((issue) => issue.code === 'invalid' && issue.field === '$')).toBe(
      true,
    );
  });
});
