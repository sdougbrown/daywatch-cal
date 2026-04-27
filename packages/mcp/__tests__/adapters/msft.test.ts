import type { MsftGraphEvent } from '../../src/adapters/types.js';
import {
  isBlockingMsftEvent,
  msftEventToDateRange,
  msftEventsToDateRanges,
} from '../../src/adapters/msft.js';

const normalMeeting: MsftGraphEvent = {
  id: 'msft_001',
  subject: 'Sprint Planning',
  isAllDay: false,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-03-30T09:00:00.0000000', timeZone: 'Eastern Standard Time' },
  end: { dateTime: '2026-03-30T10:00:00.0000000', timeZone: 'Eastern Standard Time' },
  showAs: 'busy',
  responseStatus: { response: 'accepted' },
  webLink: 'https://outlook.office365.com/owa/?itemid=msft_001',
};

const freeBlock: MsftGraphEvent = {
  id: 'msft_002',
  subject: 'Lunch',
  isAllDay: false,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-03-30T12:00:00.0000000', timeZone: 'Eastern Standard Time' },
  end: { dateTime: '2026-03-30T13:00:00.0000000', timeZone: 'Eastern Standard Time' },
  showAs: 'free',
};

const oofEvent: MsftGraphEvent = {
  id: 'msft_003',
  subject: 'Vacation',
  isAllDay: true,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-04-01T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
  end: { dateTime: '2026-04-04T00:00:00.0000000', timeZone: 'Eastern Standard Time' },
  showAs: 'oof',
};

const workingElsewhere: MsftGraphEvent = {
  id: 'msft_004',
  subject: 'Working from home',
  isAllDay: true,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-03-30T00:00:00.0000000', timeZone: 'Pacific Standard Time' },
  end: { dateTime: '2026-03-31T00:00:00.0000000', timeZone: 'Pacific Standard Time' },
  showAs: 'workingElsewhere',
};

const tentativeEvent: MsftGraphEvent = {
  id: 'msft_005',
  subject: 'Maybe Meeting',
  isAllDay: false,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-03-30T14:00:00.0000000', timeZone: 'Pacific Standard Time' },
  end: { dateTime: '2026-03-30T15:00:00.0000000', timeZone: 'Pacific Standard Time' },
  showAs: 'tentative',
  responseStatus: { response: 'tentativelyAccepted' },
};

const declinedEvent: MsftGraphEvent = {
  id: 'msft_006',
  subject: 'Skipped Standup',
  isAllDay: false,
  isCancelled: false,
  type: 'singleInstance',
  start: { dateTime: '2026-03-30T09:30:00.0000000', timeZone: 'Eastern Standard Time' },
  end: { dateTime: '2026-03-30T10:00:00.0000000', timeZone: 'Eastern Standard Time' },
  showAs: 'busy',
  responseStatus: { response: 'declined' },
};

const cancelledEvent: MsftGraphEvent = {
  ...normalMeeting,
  id: 'msft_007',
  isCancelled: true,
};

const seriesMaster: MsftGraphEvent = {
  id: 'msft_008',
  subject: 'Weekly 1:1',
  isAllDay: false,
  isCancelled: false,
  type: 'seriesMaster',
  start: { dateTime: '2026-03-30T11:00:00.0000000', timeZone: 'Eastern Standard Time' },
  end: { dateTime: '2026-03-30T11:30:00.0000000', timeZone: 'Eastern Standard Time' },
  showAs: 'busy',
  responseStatus: { response: 'organizer' },
};

const ianaTimezoneEvent: MsftGraphEvent = {
  ...normalMeeting,
  id: 'msft_009',
  start: { dateTime: '2026-03-30T09:00:00.0000000', timeZone: 'America/New_York' },
  end: { dateTime: '2026-03-30T10:00:00.0000000', timeZone: 'America/New_York' },
};

describe('isBlockingMsftEvent', () => {
  it('returns true for normal busy events', () => {
    expect(isBlockingMsftEvent(normalMeeting)).toBe(true);
  });

  it('returns false for free events by default', () => {
    expect(isBlockingMsftEvent(freeBlock)).toBe(false);
  });

  it('includes free events when requested', () => {
    expect(isBlockingMsftEvent(freeBlock, { includeFree: true })).toBe(true);
  });

  it('keeps out of office events as blocking', () => {
    expect(isBlockingMsftEvent(oofEvent)).toBe(true);
  });

  it('returns false for working elsewhere events by default', () => {
    expect(isBlockingMsftEvent(workingElsewhere)).toBe(false);
  });

  it('includes working elsewhere events when requested', () => {
    expect(isBlockingMsftEvent(workingElsewhere, { includeFree: true })).toBe(true);
  });

  it('includes tentative events by default', () => {
    expect(isBlockingMsftEvent(tentativeEvent)).toBe(true);
  });

  it('excludes tentative events when includeTentative is false', () => {
    expect(isBlockingMsftEvent(tentativeEvent, { includeTentative: false })).toBe(false);
  });

  it('returns false for declined events', () => {
    expect(isBlockingMsftEvent(declinedEvent)).toBe(false);
  });

  it('returns false for cancelled events', () => {
    expect(isBlockingMsftEvent(cancelledEvent)).toBe(false);
  });

  it('returns false for series master events', () => {
    expect(isBlockingMsftEvent(seriesMaster)).toBe(false);
  });

  it('treats missing showAs conservatively as blocking', () => {
    expect(isBlockingMsftEvent({ ...normalMeeting, showAs: undefined })).toBe(true);
  });
});

describe('msftEventToDateRange', () => {
  it('maps timed events and converts Windows timezones to IANA', () => {
    const range = msftEventToDateRange(normalMeeting);

    expect(range.fromDate).toBe('2026-03-30');
    expect(range.toDate).toBe('2026-03-30');
    expect(range.startTime).toBe('09:00');
    expect(range.endTime).toBe('10:00');
    expect(range.timezone).toBe('America/New_York');
    expect(range.label).toBe('Sprint Planning');
    expect(range.metadata).toMatchObject({
      msftId: 'msft_001',
      showAs: 'busy',
      responseStatus: 'accepted',
      webLink: 'https://outlook.office365.com/owa/?itemid=msft_001',
    });
  });

  it('maps all-day events with inclusive end dates', () => {
    const range = msftEventToDateRange(oofEvent);

    expect(range.fromDate).toBe('2026-04-01');
    expect(range.toDate).toBe('2026-04-03');
    expect(range.startTime).toBeUndefined();
    expect(range.endTime).toBeUndefined();
  });

  it('passes through IANA timezones unchanged', () => {
    const range = msftEventToDateRange(ianaTimezoneEvent);

    expect(range.timezone).toBe('America/New_York');
  });

  it('uses the default fallback label when subject is missing', () => {
    const range = msftEventToDateRange({ ...normalMeeting, subject: undefined });

    expect(range.label).toBe('(busy)');
  });

  it('uses a custom fallback label when provided', () => {
    const range = msftEventToDateRange(
      { ...normalMeeting, subject: undefined },
      { fallbackLabel: 'Private' },
    );

    expect(range.label).toBe('Private');
  });
});

describe('msftEventsToDateRanges', () => {
  it('filters out non-blocking events before mapping', () => {
    const ranges = msftEventsToDateRanges([
      normalMeeting,
      freeBlock,
      oofEvent,
      workingElsewhere,
      tentativeEvent,
      declinedEvent,
      cancelledEvent,
      seriesMaster,
      { ...freeBlock, id: 'msft_010' },
    ]);

    expect(ranges).toHaveLength(3);
    expect(ranges.map((range) => range.id)).toEqual([
      normalMeeting.id,
      oofEvent.id,
      tentativeEvent.id,
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(msftEventsToDateRanges([])).toEqual([]);
  });

  it('returns an empty array when all events are excluded', () => {
    const ranges = msftEventsToDateRanges([
      freeBlock,
      workingElsewhere,
      declinedEvent,
      cancelledEvent,
      seriesMaster,
    ]);

    expect(ranges).toEqual([]);
  });
});
