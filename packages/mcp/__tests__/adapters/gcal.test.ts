import { RangeEvaluator } from '@daywatch/cal';
import type { GCalEvent } from '../../src/adapters/types.js';
import {
  gcalEventToDateRange,
  gcalEventsToDateRanges,
  isBlockingEvent,
} from '../../src/adapters/gcal.js';

const acceptedTimed: GCalEvent = {
  id: 'evt_001_20260330T163000Z',
  summary: 'Team PR Reviews',
  eventType: 'default',
  start: {
    dateTime: '2026-03-30T12:30:00-04:00',
    timeZone: 'America/Los_Angeles',
  },
  end: {
    dateTime: '2026-03-30T13:00:00-04:00',
    timeZone: 'America/Los_Angeles',
  },
  allDay: false,
  status: 'confirmed',
  myResponseStatus: 'accepted',
  numAttendees: 4,
  recurringEventId: 'evt_001',
};

const workingLocation: GCalEvent = {
  id: 'evt_002_20260330',
  summary: 'Home',
  eventType: 'workingLocation',
  start: { date: '2026-03-30' },
  end: { date: '2026-03-31' },
  allDay: true,
  status: 'confirmed',
  transparency: 'transparent',
};

const transparentAllDay: GCalEvent = {
  id: 'evt_003_20260331',
  summary: 'Store Inventory Day',
  eventType: 'default',
  start: { date: '2026-03-31' },
  end: { date: '2026-04-01' },
  allDay: true,
  status: 'confirmed',
  myResponseStatus: 'accepted',
  transparency: 'transparent',
};

const tentativeEvent: GCalEvent = {
  id: 'evt_006_20260402T200000Z',
  summary: 'Backend Community Sync',
  eventType: 'default',
  start: {
    dateTime: '2026-04-02T16:00:00-04:00',
    timeZone: 'America/New_York',
  },
  end: { dateTime: '2026-04-02T16:45:00-04:00', timeZone: 'America/New_York' },
  allDay: false,
  status: 'confirmed',
  myResponseStatus: 'tentative',
};

const outOfOffice: GCalEvent = {
  id: 'evt_007',
  summary: 'Parental Leave',
  eventType: 'outOfOffice',
  start: {
    dateTime: '2026-03-31T00:00:00-07:00',
    timeZone: 'America/Los_Angeles',
  },
  end: {
    dateTime: '2026-06-27T00:00:00-07:00',
    timeZone: 'America/Los_Angeles',
  },
  allDay: false,
  status: 'confirmed',
};

const declinedEvent: GCalEvent = {
  id: 'evt_008_20260330T170000Z',
  summary: 'Sprint Planning',
  eventType: 'default',
  start: {
    dateTime: '2026-03-30T13:00:00-04:00',
    timeZone: 'America/Los_Angeles',
  },
  end: {
    dateTime: '2026-03-30T14:00:00-04:00',
    timeZone: 'America/Los_Angeles',
  },
  allDay: false,
  status: 'confirmed',
  myResponseStatus: 'declined',
};

const focusBlock: GCalEvent = {
  id: 'evt_009',
  summary: 'Focus Time (auto-scheduled)',
  eventType: 'default',
  start: { dateTime: '2026-03-30T14:00:00-04:00', timeZone: 'America/Chicago' },
  end: { dateTime: '2026-03-30T18:00:00-04:00', timeZone: 'America/Chicago' },
  allDay: false,
  status: 'confirmed',
};

const noTimezone: GCalEvent = {
  id: 'evt_011',
  summary: 'Travel Block',
  eventType: 'default',
  start: { dateTime: '2026-03-30T11:00:00-04:00' },
  end: { dateTime: '2026-03-30T19:00:00-04:00' },
  allDay: false,
  status: 'confirmed',
};

// --- Raw Google Calendar API format repros (issues #41 and #42) ---

// Issue #42: raw format puts the current user's response on the self
// attendee instead of myResponseStatus.
const declinedAllDayRaw: GCalEvent = {
  id: 'evt_raw_042a',
  summary: 'Company Offsite',
  eventType: 'default',
  start: { date: '2026-04-01' },
  end: { date: '2026-04-02' },
  status: 'confirmed',
  attendees: [{ email: 'me@example.com', responseStatus: 'declined', self: true }],
};

const declinedTimedRaw: GCalEvent = {
  id: 'evt_raw_042b',
  summary: 'Vendor Demo',
  eventType: 'default',
  start: { dateTime: '2026-04-01T10:00:00-07:00' },
  end: { dateTime: '2026-04-01T11:00:00-07:00' },
  status: 'confirmed',
  attendees: [{ email: 'me@example.com', responseStatus: 'declined', self: true }],
};

const workingLocationRaw: GCalEvent = {
  id: 'evt_raw_042c',
  summary: 'Home Office',
  eventType: 'WORKING_LOCATION',
  start: { date: '2026-04-01' },
  end: { date: '2026-04-02' },
  status: 'confirmed',
};

// Issue #41: the dateTime offset is authoritative — 11:00-06:00 is 17:00Z,
// which is 10:00 in America/Los_Angeles, not 11:00.
const offsetZoneMismatch: GCalEvent = {
  id: 'evt_raw_041a',
  summary: 'Cross-Zone Sync',
  eventType: 'default',
  start: { dateTime: '2026-03-30T11:00:00-06:00', timeZone: 'America/Los_Angeles' },
  end: { dateTime: '2026-03-30T12:00:00-06:00', timeZone: 'America/Los_Angeles' },
  status: 'confirmed',
};

const offsetNoTimeZone: GCalEvent = {
  id: 'evt_raw_041b',
  summary: 'Offset-Only Event',
  eventType: 'default',
  start: { dateTime: '2026-03-30T11:00:00-06:00' },
  end: { dateTime: '2026-03-30T12:00:00-06:00' },
  status: 'confirmed',
};

const midnightCrossingRaw: GCalEvent = {
  id: 'evt_raw_041c',
  summary: 'Late Call into Tokyo Tomorrow',
  eventType: 'default',
  start: { dateTime: '2026-03-30T14:00:00-06:00', timeZone: 'Asia/Tokyo' },
  end: { dateTime: '2026-03-30T15:30:00-06:00', timeZone: 'Asia/Tokyo' },
  status: 'confirmed',
};

describe('isBlockingEvent', () => {
  it('returns true for an accepted timed event', () => {
    expect(isBlockingEvent(acceptedTimed)).toBe(true);
  });

  it('returns false for working location events', () => {
    expect(isBlockingEvent(workingLocation)).toBe(false);
  });

  it('returns false for condensed working-location events with no transparency field', () => {
    // The eventType branch, not the transparency branch, must exclude this.
    expect(isBlockingEvent({ ...workingLocation, transparency: undefined })).toBe(false);
  });

  it('returns false for transparent events by default', () => {
    expect(isBlockingEvent(transparentAllDay)).toBe(false);
  });

  it('includes transparent events when requested', () => {
    expect(isBlockingEvent(transparentAllDay, { includeTransparent: true })).toBe(true);
  });

  it('includes tentative events by default', () => {
    expect(isBlockingEvent(tentativeEvent)).toBe(true);
  });

  it('excludes tentative events when includeTentative is false', () => {
    expect(isBlockingEvent(tentativeEvent, { includeTentative: false })).toBe(false);
  });

  it('keeps out of office events as blocking', () => {
    expect(isBlockingEvent(outOfOffice)).toBe(true);
  });

  it('returns false for declined events', () => {
    expect(isBlockingEvent(declinedEvent)).toBe(false);
  });

  it('returns false for raw-format all-day events declined via the self attendee', () => {
    expect(isBlockingEvent(declinedAllDayRaw)).toBe(false);
  });

  it('returns false for raw-format timed events declined via the self attendee', () => {
    expect(isBlockingEvent(declinedTimedRaw)).toBe(false);
  });

  it('excludes raw-format uppercase WORKING_LOCATION and BIRTHDAY events', () => {
    expect(isBlockingEvent(workingLocationRaw)).toBe(false);
    expect(
      isBlockingEvent({
        ...workingLocationRaw,
        id: 'evt_raw_birthday',
        eventType: 'BIRTHDAY',
      }),
    ).toBe(false);
  });

  it('keeps raw-format events accepted via the self attendee as blocking', () => {
    expect(
      isBlockingEvent({
        ...declinedTimedRaw,
        id: 'evt_raw_accepted',
        attendees: [{ email: 'me@example.com', responseStatus: 'accepted', self: true }],
      }),
    ).toBe(true);
  });

  it('falls back to myResponseStatus when the self attendee carries no responseStatus', () => {
    expect(
      isBlockingEvent({
        ...declinedTimedRaw,
        id: 'evt_raw_fallback',
        myResponseStatus: 'accepted',
        attendees: [{ email: 'me@example.com', self: true }],
      }),
    ).toBe(true);
    expect(
      isBlockingEvent({
        ...declinedTimedRaw,
        id: 'evt_raw_fallback_declined',
        myResponseStatus: 'declined',
        attendees: [{ email: 'me@example.com', self: true }],
      }),
    ).toBe(false);
  });

  it('excludes self-attendee tentative events when includeTentative is false', () => {
    expect(
      isBlockingEvent(
        {
          ...declinedTimedRaw,
          id: 'evt_raw_tentative',
          attendees: [{ email: 'me@example.com', responseStatus: 'tentative', self: true }],
        },
        { includeTentative: false },
      ),
    ).toBe(false);
  });

  it('returns false for cancelled events', () => {
    expect(isBlockingEvent({ ...acceptedTimed, status: 'cancelled' })).toBe(false);
  });
});

describe('gcalEventToDateRange', () => {
  it('expresses the clock time in the range timezone when the offset disagrees with it', () => {
    // 12:30-04:00 is 16:30Z — 09:30 in America/Los_Angeles, the tagged zone.
    const range = gcalEventToDateRange(acceptedTimed);

    expect(range.fromDate).toBe('2026-03-30');
    expect(range.toDate).toBe('2026-03-30');
    expect(range.startTime).toBe('09:30');
    expect(range.endTime).toBe('10:00');
    expect(range.duration).toBe(30);
    expect(range.timezone).toBe('America/Los_Angeles');
    expect(range.label).toBe('Team PR Reviews');
    expect(range.id).toBe('evt_001_20260330T163000Z');
    expect(range.metadata).toMatchObject({
      gcalId: 'evt_001_20260330T163000Z',
      responseStatus: 'accepted',
    });
  });

  it('lands a cross-zone event at its true instant for the session timezone', () => {
    // 11:00-06:00 is 17:00Z — 13:00 in America/New_York. Before the fix the
    // adapter kept the 11:00 wall clock in the LA zone, which evaluates to
    // 14:00 ET and misses the conflict.
    const meeting = {
      id: 'mtg_et',
      label: 'Overlapping meeting',
      dates: ['2026-03-30'],
      startTime: '13:00',
      endTime: '14:00',
    };

    const evaluator = new RangeEvaluator('America/New_York');
    const conflicts = evaluator.findConflicts(
      [gcalEventToDateRange(offsetZoneMismatch), meeting],
      '2026-03-30',
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapStart).toBe('13:00');
    expect(conflicts[0].overlapEnd).toBe('14:00');
  });

  it('evaluates an offset-only event at its true instant for the session timezone', () => {
    // Issue #41 event B: 12:00-06:00 is 18:00Z — 13:00 ET, not 12:00 floating.
    const evtB = {
      id: 'evt-b',
      status: 'confirmed',
      eventType: 'DEFAULT',
      start: { dateTime: '2026-11-03T12:00:00-06:00' },
      end: { dateTime: '2026-11-03T12:30:00-06:00' },
    } as never;
    const meeting = {
      id: 'mtg_et',
      label: 'Overlapping meeting',
      dates: ['2026-11-03'],
      startTime: '13:00',
      endTime: '13:30',
    } as never;
    const evaluator = new RangeEvaluator('America/New_York');

    expect(
      evaluator.findConflicts([gcalEventToDateRange(evtB), meeting], '2026-11-03'),
    ).toHaveLength(1);
  });

  it('pins an offset-only event to UTC instead of leaving it floating', () => {
    // 11:00-06:00 is 17:00Z; the range is evaluated in UTC and the evaluator
    // converts to the session zone from there.
    const range = gcalEventToDateRange(offsetNoTimeZone);

    expect(range.timezone).toBe('UTC');
    expect(range.fromDate).toBe('2026-03-30');
    expect(range.toDate).toBe('2026-03-30');
    expect(range.startTime).toBe('17:00');
    expect(range.endTime).toBe('18:00');
  });

  it('rolls the date over for events that cross midnight after zone conversion', () => {
    // 14:00-06:00 is 20:00Z on Mar 30 — already Mar 31 in Asia/Tokyo.
    const range = gcalEventToDateRange(midnightCrossingRaw);

    expect(range.timezone).toBe('Asia/Tokyo');
    expect(range.fromDate).toBe('2026-03-31');
    expect(range.toDate).toBe('2026-03-31');
    expect(range.startTime).toBe('05:00');
    expect(range.endTime).toBe('06:30');
  });

  it('maps all-day events with inclusive end dates', () => {
    const range = gcalEventToDateRange(transparentAllDay);

    expect(range.fromDate).toBe('2026-03-31');
    expect(range.toDate).toBe('2026-03-31');
    expect(range.startTime).toBeUndefined();
    expect(range.endTime).toBeUndefined();
  });

  it('preserves multi-month timed spans', () => {
    const range = gcalEventToDateRange(outOfOffice);

    expect(range.fromDate).toBe('2026-03-31');
    expect(range.toDate).toBe('2026-06-27');
    expect(range.startTime).toBe('00:00');
    expect(range.endTime).toBe('00:00');
    // Duration must be set (and span multiple days) so the evaluator treats
    // this as a continuous block rather than a midnight-to-midnight daily
    // window — same shape, told apart by duration.
    expect(range.duration).toBeGreaterThan(1440);
  });

  it('produces a span the evaluator flags as occupied on interior days', () => {
    // Regression: a multi-day timed event (e.g. a week-long on-call shift)
    // must conflict with a meeting on an interior day. Before the adapter set
    // `duration`, the evaluator could not distinguish this from a daily window
    // and collapsed it to a zero-width point per day, missing the overlap.
    const shiftRange = gcalEventToDateRange(outOfOffice);
    const meeting = {
      id: 'mtg',
      label: 'Interior meeting',
      dates: ['2026-05-01'],
      startTime: '09:00',
      endTime: '10:00',
    };

    const evaluator = new RangeEvaluator('America/Los_Angeles');
    const conflicts = evaluator.findConflicts([shiftRange, meeting], '2026-05-01');

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapStart).toBe('09:00');
    expect(conflicts[0].overlapEnd).toBe('10:00');
  });

  it('keeps offset-free dateTimes floating', () => {
    const range = gcalEventToDateRange({
      ...noTimezone,
      start: { dateTime: '2026-03-30T11:00' },
      end: { dateTime: '2026-03-30T19:00' },
    });

    expect(range.startTime).toBe('11:00');
    expect(range.timezone).toBeUndefined();
  });

  it('pins offset-bearing dateTimes without a timeZone to UTC', () => {
    // 11:00-04:00 is 15:00Z; 19:00-04:00 is 23:00Z.
    const range = gcalEventToDateRange(noTimezone);

    expect(range.timezone).toBe('UTC');
    expect(range.startTime).toBe('15:00');
    expect(range.endTime).toBe('23:00');
  });

  it('uses the default fallback label when summary is missing', () => {
    const range = gcalEventToDateRange({
      ...acceptedTimed,
      summary: undefined,
    });

    expect(range.label).toBe('(busy)');
  });

  it('uses a custom fallback label when provided', () => {
    const range = gcalEventToDateRange(
      { ...acceptedTimed, summary: undefined },
      { fallbackLabel: 'Private' },
    );

    expect(range.label).toBe('Private');
  });
});

describe('gcalEventsToDateRanges', () => {
  it('filters out non-blocking events before mapping', () => {
    const ranges = gcalEventsToDateRanges([
      acceptedTimed,
      workingLocation,
      transparentAllDay,
      tentativeEvent,
    ]);

    expect(ranges).toHaveLength(2);
    expect(ranges.map((range) => range.id)).toEqual([acceptedTimed.id, tentativeEvent.id]);
  });

  it('returns an empty array for empty input', () => {
    expect(gcalEventsToDateRanges([])).toEqual([]);
  });

  it('returns an empty array when all events are excluded', () => {
    const ranges = gcalEventsToDateRanges([workingLocation, transparentAllDay, declinedEvent]);

    expect(ranges).toEqual([]);
  });

  it('maps other blocking timed events in batch mode', () => {
    const ranges = gcalEventsToDateRanges([focusBlock]);

    expect(ranges).toEqual([
      expect.objectContaining({
        id: 'evt_009',
        // 14:00-04:00 is 18:00Z — 13:00 in America/Chicago (CDT).
        fromDate: '2026-03-30',
        toDate: '2026-03-30',
        startTime: '13:00',
        endTime: '17:00',
      }),
    ]);
  });

  it('filters raw-format declined and working-location events in batch mode', () => {
    const ranges = gcalEventsToDateRanges([
      declinedAllDayRaw,
      declinedTimedRaw,
      workingLocationRaw,
      offsetZoneMismatch,
    ]);

    expect(ranges).toHaveLength(1);
    expect(ranges[0].id).toBe(offsetZoneMismatch.id);
  });

  it('surfaces the self attendee response status in range metadata', () => {
    const range = gcalEventToDateRange({
      ...declinedTimedRaw,
      attendees: [{ email: 'me@example.com', responseStatus: 'tentative', self: true }],
    });

    expect(range.metadata).toMatchObject({ responseStatus: 'tentative' });
  });

  it('keeps condensed eventType values verbatim in metadata', () => {
    const range = gcalEventToDateRange({
      ...acceptedTimed,
      eventType: 'outOfOffice',
    });

    expect(range.metadata.eventType).toBe('outOfOffice');
  });

  it('normalizes raw uppercase eventType values to camelCase in metadata', () => {
    const range = gcalEventToDateRange(workingLocationRaw);

    expect(range.metadata.eventType).toBe('workingLocation');
  });

  it('pins Z-suffixed dateTimes without a timeZone to UTC', () => {
    const range = gcalEventToDateRange({
      ...noTimezone,
      start: { dateTime: '2026-03-30T11:00:00Z' },
      end: { dateTime: '2026-03-30T12:00:00Z' },
    });

    expect(range.timezone).toBe('UTC');
    expect(range.startTime).toBe('11:00');
    expect(range.endTime).toBe('12:00');
  });
});
