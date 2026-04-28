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

describe('isBlockingEvent', () => {
  it('returns true for an accepted timed event', () => {
    expect(isBlockingEvent(acceptedTimed)).toBe(true);
  });

  it('returns false for working location events', () => {
    expect(isBlockingEvent(workingLocation)).toBe(false);
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

  it('returns false for cancelled events', () => {
    expect(isBlockingEvent({ ...acceptedTimed, status: 'cancelled' })).toBe(false);
  });
});

describe('gcalEventToDateRange', () => {
  it('maps timed events without converting their clock time', () => {
    const range = gcalEventToDateRange(acceptedTimed);

    expect(range.fromDate).toBe('2026-03-30');
    expect(range.toDate).toBe('2026-03-30');
    expect(range.startTime).toBe('12:30');
    expect(range.endTime).toBe('13:00');
    expect(range.timezone).toBe('America/Los_Angeles');
    expect(range.label).toBe('Team PR Reviews');
    expect(range.id).toBe('evt_001_20260330T163000Z');
    expect(range.metadata).toMatchObject({
      gcalId: 'evt_001_20260330T163000Z',
      responseStatus: 'accepted',
    });
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
  });

  it('leaves timezone undefined for floating timed events', () => {
    const range = gcalEventToDateRange(noTimezone);

    expect(range.timezone).toBeUndefined();
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
        fromDate: '2026-03-30',
        toDate: '2026-03-30',
        startTime: '14:00',
        endTime: '18:00',
      }),
    ]);
  });
});
