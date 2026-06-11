import { readFileSync } from 'node:fs';

import type {
  DateRange,
  DayRangeInfo,
  FreeSlot,
  Occurrence,
  ScheduleScore,
  TimeSlot,
} from '@daywatch/cal';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { GCalEvent, MsftGraphEvent } from '../src/adapters/types.js';
import { handleToolCall } from '../src/server.js';
import { CalendarSession } from '../src/state.js';

const testRanges: DateRange[] = [
  {
    id: 'standup',
    label: 'Daily Standup',
    everyWeekday: [1, 2, 3, 4, 5],
    startTime: '09:00',
    endTime: '09:30',
    duration: 30,
  },
  {
    id: 'review',
    label: 'Code Review',
    dates: ['2026-03-25'],
    startTime: '09:15',
    endTime: '10:00',
    duration: 45,
  },
  {
    id: 'holiday',
    label: 'Holiday',
    dates: ['2026-03-21'],
  },
  {
    id: 'sprint',
    label: 'Sprint Planning',
    everyWeekday: [1],
    startTime: '14:00',
    endTime: '15:00',
    duration: 60,
    fromDate: '2026-03-01',
    toDate: '2026-06-30',
  },
];

function getTextContent(result: CallToolResult): string {
  const entry = result.content.find((item) => item.type === 'text');
  if (!entry) {
    throw new Error('Expected text content in tool result.');
  }

  return entry.text;
}

function parseJsonContent<T>(result: CallToolResult): T {
  return JSON.parse(getTextContent(result)) as T;
}

function createLoadedSession(): CalendarSession {
  const session = new CalendarSession('UTC');
  session.loadCalendar('work', testRanges, 'ranges');
  return session;
}

function loadIcsFixture(name: string): string {
  return readFileSync(new URL(`../../ical/__tests__/fixtures/${name}`, import.meta.url), 'utf8');
}

describe('handleToolCall', () => {
  it('loads calendar data from DateRange JSON', async () => {
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar', {
      source: 'ranges',
      data: JSON.stringify(testRanges),
      id: 'work',
      window_from: '2026-03-01',
      window_to: '2026-06-30',
    });

    expect(result.isError).toBeUndefined();
    expect(
      parseJsonContent<{
        calendars_loaded: number;
        ranges_loaded: number;
        calendar_id: string;
        effective_window: { from: string; to: string };
        sample_labels: string[];
        has_more_labels: boolean;
      }>(result),
    ).toEqual({
      calendars_loaded: 1,
      ranges_loaded: 4,
      calendar_id: 'work',
      effective_window: {
        from: '2026-03-01',
        to: '2026-06-30',
      },
      detected_data_window: null,
      sample_labels: ['Daily Standup', 'Code Review', 'Holiday', 'Sprint Planning'],
      has_more_labels: false,
    });
  });

  it('auto-detects an alternate data window when the requested ICS window yields no ranges', async () => {
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar', {
      source: 'ics',
      data: [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:school-day',
        'SUMMARY:School Day',
        'DTSTART;VALUE=DATE:20250615',
        'DTEND;VALUE=DATE:20250616',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
      id: 'school',
      window_from: '2026-02-01',
      window_to: '2026-08-31',
    });

    expect(
      parseJsonContent<{
        ranges_loaded: number;
        calendar_id: string;
        effective_window: { from: string; to: string };
        sample_labels: string[];
      }>(result),
    ).toEqual(
      expect.objectContaining({
        ranges_loaded: 1,
        calendar_id: 'school',
        effective_window: {
          from: '2025-05-15',
          to: '2025-07-16',
        },
        sample_labels: ['School Day'],
      }),
    );
  });

  describe('load_calendar with source gcal', () => {
    it('loads blocking events from Google Calendar JSON', async () => {
      const session = new CalendarSession();
      const gcalEvents: GCalEvent[] = [
        {
          id: 'evt_001',
          summary: 'Team Sync',
          eventType: 'default',
          start: {
            dateTime: '2026-03-30T09:00:00-04:00',
            timeZone: 'America/New_York',
          },
          end: {
            dateTime: '2026-03-30T10:00:00-04:00',
            timeZone: 'America/New_York',
          },
          allDay: false,
          status: 'confirmed',
          myResponseStatus: 'accepted',
        },
        {
          id: 'evt_002',
          summary: 'Home',
          eventType: 'workingLocation',
          start: { date: '2026-03-30' },
          end: { date: '2026-03-31' },
          allDay: true,
          status: 'confirmed',
          transparency: 'transparent',
        },
        {
          id: 'evt_003',
          summary: 'Focus Block',
          eventType: 'default',
          start: {
            dateTime: '2026-03-30T14:00:00-04:00',
            timeZone: 'America/New_York',
          },
          end: {
            dateTime: '2026-03-30T16:00:00-04:00',
            timeZone: 'America/New_York',
          },
          allDay: false,
          status: 'confirmed',
        },
        {
          id: 'evt_004',
          summary: 'Declined Meeting',
          eventType: 'default',
          start: {
            dateTime: '2026-03-30T11:00:00-04:00',
            timeZone: 'America/New_York',
          },
          end: {
            dateTime: '2026-03-30T12:00:00-04:00',
            timeZone: 'America/New_York',
          },
          allDay: false,
          status: 'confirmed',
          myResponseStatus: 'declined',
        },
      ];

      const result = await handleToolCall(session, 'load_calendar', {
        source: 'gcal',
        data: JSON.stringify(gcalEvents),
        id: 'alice',
      });
      const body = parseJsonContent<{
        ranges_loaded: number;
        calendar_id: string;
      }>(result);

      expect(body.ranges_loaded).toBe(2);
      expect(body.calendar_id).toBe('alice');

      const loaded = session.calendars.get('alice');
      expect(loaded).toBeDefined();
      expect(loaded?.source).toBe('gcal');
      expect(loaded?.ranges).toHaveLength(2);
      expect(loaded?.ranges[0]?.label).toBe('Team Sync');
      expect(loaded?.ranges[1]?.label).toBe('Focus Block');
    });

    it('rejects non-array gcal data', async () => {
      const session = new CalendarSession();
      const result = await handleToolCall(session, 'load_calendar', {
        source: 'gcal',
        data: JSON.stringify({ events: [] }),
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('load_calendar with source msft', () => {
    it('loads blocking events from Microsoft Graph JSON', async () => {
      const session = new CalendarSession();
      const msftEvents: MsftGraphEvent[] = [
        {
          id: 'msft_001',
          subject: 'Sprint Planning',
          isAllDay: false,
          isCancelled: false,
          type: 'singleInstance',
          start: {
            dateTime: '2026-03-30T09:00:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          end: {
            dateTime: '2026-03-30T10:00:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          showAs: 'busy',
          responseStatus: { response: 'accepted' },
        },
        {
          id: 'msft_002',
          subject: 'Working from home',
          isAllDay: true,
          isCancelled: false,
          type: 'singleInstance',
          start: {
            dateTime: '2026-03-30T00:00:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          end: {
            dateTime: '2026-03-31T00:00:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          showAs: 'workingElsewhere',
        },
        {
          id: 'msft_003',
          subject: 'Code Review',
          isAllDay: false,
          isCancelled: false,
          type: 'singleInstance',
          start: {
            dateTime: '2026-03-30T14:00:00.0000000',
            timeZone: 'Pacific Standard Time',
          },
          end: {
            dateTime: '2026-03-30T15:00:00.0000000',
            timeZone: 'Pacific Standard Time',
          },
          showAs: 'busy',
        },
        {
          id: 'msft_004',
          subject: 'Declined Standup',
          isAllDay: false,
          isCancelled: false,
          type: 'singleInstance',
          start: {
            dateTime: '2026-03-30T09:30:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          end: {
            dateTime: '2026-03-30T10:00:00.0000000',
            timeZone: 'Eastern Standard Time',
          },
          showAs: 'busy',
          responseStatus: { response: 'declined' },
        },
      ];

      const result = await handleToolCall(session, 'load_calendar', {
        source: 'msft',
        data: JSON.stringify(msftEvents),
        id: 'bob',
      });

      const body = parseJsonContent<{
        ranges_loaded: number;
        calendar_id: string;
      }>(result);
      expect(body.ranges_loaded).toBe(2);
      expect(body.calendar_id).toBe('bob');

      const loaded = session.calendars.get('bob')!;
      expect(loaded.source).toBe('msft');
      expect(loaded.ranges).toHaveLength(2);
      expect(loaded.ranges[0].label).toBe('Sprint Planning');
      expect(loaded.ranges[0].timezone).toBe('America/New_York');
      expect(loaded.ranges[1].label).toBe('Code Review');
      expect(loaded.ranges[1].timezone).toBe('America/Los_Angeles');
    });

    it('rejects non-array msft data', async () => {
      const session = new CalendarSession();
      const result = await handleToolCall(session, 'load_calendar', {
        source: 'msft',
        data: JSON.stringify({ value: [] }),
      });

      expect(result.isError).toBe(true);
    });
  });

  it('lists loaded calendars with range counts and labels', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'list_calendars');

    expect(
      parseJsonContent<
        Array<{
          id: string;
          rangeCount: number;
          labels: string[];
          has_more_labels: boolean;
        }>
      >(result),
    ).toEqual([
      {
        id: 'work',
        rangeCount: 4,
        labels: ['Daily Standup', 'Code Review', 'Holiday', 'Sprint Planning'],
        has_more_labels: false,
        effective_window: null,
      },
    ]);
  });

  describe('list_ranges', () => {
    interface ListRangeRow {
      calendar_id: string;
      range_id: string;
      label: string;
      series_id?: string;
      from_date?: string;
      to_date?: string | null;
      unbounded?: boolean;
      recurrence_summary?: string;
      start_time?: string;
      end_time?: string;
      all_day: boolean;
      timezone?: string | null;
      occurrence_count?: number;
      first_occurrence?: string;
      last_occurrence?: string;
    }

    interface ListRangesResponse {
      ranges: ListRangeRow[];
      total: number;
      truncated?: boolean;
      message?: string;
      timezone: string;
      calendars: Array<{ id: string; effective_window: { from: string; to: string } | null }>;
      count_within?: { from: string; to: string };
    }

    function gcalInstance(id: string, date: string, seriesId?: string): GCalEvent {
      return {
        id,
        summary: seriesId ? 'Oncall Sync' : 'One-off Review',
        eventType: 'default',
        start: { dateTime: `${date}T09:00:00-04:00`, timeZone: 'America/New_York' },
        end: { dateTime: `${date}T10:00:00-04:00`, timeZone: 'America/New_York' },
        allDay: false,
        status: 'confirmed',
        ...(seriesId ? { recurringEventId: seriesId } : {}),
      };
    }

    async function createGcalSession(): Promise<CalendarSession> {
      const session = new CalendarSession('UTC');
      const events = [
        gcalInstance('inst_1', '2026-03-30', 'series_oncall'),
        gcalInstance('inst_2', '2026-04-06', 'series_oncall'),
        gcalInstance('inst_3', '2026-04-13', 'series_oncall'),
        gcalInstance('oneoff_1', '2026-04-01'),
      ];

      const result = await handleToolCall(session, 'load_calendar', {
        source: 'gcal',
        data: JSON.stringify(events),
        id: 'alice',
      });
      expect(result.isError).toBeUndefined();

      return session;
    }

    it('lists stored ranges with summary metadata, sorted chronologically', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', {});
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(4);
      expect(body.timezone).toBe('UTC');
      expect(body.calendars).toEqual([{ id: 'work', effective_window: null }]);
      expect(body.truncated).toBeUndefined();
      expect(body.ranges).toEqual([
        {
          calendar_id: 'work',
          range_id: 'sprint',
          label: 'Sprint Planning',
          from_date: '2026-03-01',
          to_date: '2026-06-30',
          recurrence_summary: 'weekly on Mon',
          start_time: '14:00',
          end_time: '15:00',
          all_day: false,
        },
        {
          calendar_id: 'work',
          range_id: 'holiday',
          label: 'Holiday',
          from_date: '2026-03-21',
          to_date: '2026-03-21',
          all_day: true,
          occurrence_count: 1,
        },
        {
          calendar_id: 'work',
          range_id: 'review',
          label: 'Code Review',
          from_date: '2026-03-25',
          to_date: '2026-03-25',
          start_time: '09:15',
          end_time: '10:00',
          all_day: false,
          occurrence_count: 1,
        },
        {
          calendar_id: 'work',
          range_id: 'standup',
          label: 'Daily Standup',
          to_date: null,
          unbounded: true,
          recurrence_summary: 'weekly on Mon, Tue, Wed, Thu, Fri',
          start_time: '09:00',
          end_time: '09:30',
          all_day: false,
        },
      ]);
    });

    it('groups gcal series instances into one row by default', async () => {
      const session = await createGcalSession();

      const result = await handleToolCall(session, 'list_ranges', {});
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(2);
      expect(body.ranges).toEqual([
        expect.objectContaining({
          calendar_id: 'alice',
          range_id: 'inst_1',
          label: 'Oncall Sync',
          series_id: 'series_oncall',
          from_date: '2026-03-30',
          to_date: '2026-04-13',
          occurrence_count: 3,
          start_time: '09:00',
          end_time: '10:00',
          all_day: false,
          timezone: 'America/New_York',
        }),
        expect.objectContaining({
          range_id: 'oneoff_1',
          label: 'One-off Review',
          occurrence_count: 1,
        }),
      ]);
    });

    it('returns one row per stored range with group_by none', async () => {
      const session = await createGcalSession();

      const result = await handleToolCall(session, 'list_ranges', { group_by: 'none' });
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(4);
      expect(body.ranges.map((row) => row.range_id)).toEqual([
        'inst_1',
        'oneoff_1',
        'inst_2',
        'inst_3',
      ]);
      expect(body.ranges.every((row) => row.series_id === undefined)).toBe(true);
    });

    it('filters rows by case-insensitive label regex', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', { label_match: 'planning' });
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(1);
      expect(body.ranges[0].range_id).toBe('sprint');
    });

    it('rejects an invalid label regex', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', { label_match: '(' });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain('not a valid regular expression');
    });

    it('computes occurrence stats within a count_within window', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-03-23', to: '2026-03-27' },
      });
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.count_within).toEqual({ from: '2026-03-23', to: '2026-03-27' });

      const byId = new Map(body.ranges.map((row) => [row.range_id, row]));
      expect(byId.get('standup')).toEqual(
        expect.objectContaining({
          occurrence_count: 5,
          first_occurrence: '2026-03-23',
          last_occurrence: '2026-03-27',
        }),
      );
      expect(byId.get('sprint')).toEqual(
        expect.objectContaining({
          occurrence_count: 1,
          first_occurrence: '2026-03-23',
          last_occurrence: '2026-03-23',
        }),
      );
      expect(byId.get('review')).toEqual(
        expect.objectContaining({
          occurrence_count: 1,
          first_occurrence: '2026-03-25',
        }),
      );
      expect(byId.get('holiday')).toEqual(expect.objectContaining({ occurrence_count: 0 }));
      expect(byId.get('holiday')?.first_occurrence).toBeUndefined();
    });

    it('counts series instances within a count_within window', async () => {
      const session = await createGcalSession();

      const result = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-04-01', to: '2026-04-30' },
      });
      const body = parseJsonContent<ListRangesResponse>(result);

      const series = body.ranges.find((row) => row.series_id === 'series_oncall');
      expect(series).toEqual(
        expect.objectContaining({
          occurrence_count: 2,
          first_occurrence: '2026-04-06',
          last_occurrence: '2026-04-13',
        }),
      );
    });

    it('reports zero occurrences for single events outside the count_within window', async () => {
      const session = await createGcalSession();

      const result = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-05-01', to: '2026-05-31' },
      });
      const body = parseJsonContent<ListRangesResponse>(result);

      const oneoff = body.ranges.find((row) => row.range_id === 'oneoff_1');
      expect(oneoff?.occurrence_count).toBe(0);
      expect(oneoff?.first_occurrence).toBeUndefined();

      const series = body.ranges.find((row) => row.series_id === 'series_oncall');
      expect(series?.occurrence_count).toBe(0);
    });

    it('treats everyHour ranges as unbounded patterns and counts by occurrence_unit', async () => {
      const session = new CalendarSession('UTC');
      session.loadCalendar(
        'meds',
        [{ id: 'pills', label: 'Take Pills', everyHour: [9, 14] }],
        'ranges',
      );

      const structural = await handleToolCall(session, 'list_ranges', {});
      const structuralBody = parseJsonContent<ListRangesResponse>(structural);
      expect(structuralBody.ranges[0]).toEqual(
        expect.objectContaining({ range_id: 'pills', to_date: null, unbounded: true }),
      );
      expect(structuralBody.ranges[0].occurrence_count).toBeUndefined();

      const events = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-03-23', to: '2026-03-27' },
      });
      expect(parseJsonContent<ListRangesResponse>(events).ranges[0].occurrence_count).toBe(10);

      const days = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-03-23', to: '2026-03-27' },
        occurrence_unit: 'days',
      });
      expect(parseJsonContent<ListRangesResponse>(days).ranges[0].occurrence_count).toBe(5);
    });

    it('counts same-day series instances by occurrence_unit', async () => {
      const session = new CalendarSession('UTC');
      const sameDayEvents: GCalEvent[] = [
        {
          id: 'shift_am',
          summary: 'Oncall Shift',
          eventType: 'default',
          start: { dateTime: '2026-03-30T09:00:00Z' },
          end: { dateTime: '2026-03-30T10:00:00Z' },
          allDay: false,
          status: 'confirmed',
          recurringEventId: 'series_shift',
        },
        {
          id: 'shift_pm',
          summary: 'Oncall Shift',
          eventType: 'default',
          start: { dateTime: '2026-03-30T15:00:00Z' },
          end: { dateTime: '2026-03-30T16:00:00Z' },
          allDay: false,
          status: 'confirmed',
          recurringEventId: 'series_shift',
        },
        {
          id: 'shift_next',
          summary: 'Oncall Shift',
          eventType: 'default',
          start: { dateTime: '2026-03-31T09:00:00Z' },
          end: { dateTime: '2026-03-31T10:00:00Z' },
          allDay: false,
          status: 'confirmed',
          recurringEventId: 'series_shift',
        },
      ];
      await handleToolCall(session, 'load_calendar', {
        source: 'gcal',
        data: JSON.stringify(sameDayEvents),
        id: 'oncall',
      });

      const events = await handleToolCall(session, 'list_ranges', {});
      expect(parseJsonContent<ListRangesResponse>(events).ranges[0].occurrence_count).toBe(3);

      const days = await handleToolCall(session, 'list_ranges', { occurrence_unit: 'days' });
      expect(parseJsonContent<ListRangesResponse>(days).ranges[0].occurrence_count).toBe(2);
    });

    it('groups msft series instances by seriesMasterId', async () => {
      const session = new CalendarSession('UTC');
      const msftEvents: MsftGraphEvent[] = ['2026-04-01', '2026-04-08'].map((date, index) => ({
        id: `occ_${index + 1}`,
        subject: 'Weekly Standup',
        isAllDay: false,
        isCancelled: false,
        type: 'occurrence',
        seriesMasterId: 'master_standup',
        start: { dateTime: `${date}T09:00:00.0000000`, timeZone: 'Eastern Standard Time' },
        end: { dateTime: `${date}T09:30:00.0000000`, timeZone: 'Eastern Standard Time' },
        showAs: 'busy',
      }));
      await handleToolCall(session, 'load_calendar', {
        source: 'msft',
        data: JSON.stringify(msftEvents),
        id: 'outlook',
      });

      const result = await handleToolCall(session, 'list_ranges', {});
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(1);
      expect(body.ranges[0]).toEqual(
        expect.objectContaining({
          range_id: 'occ_1',
          series_id: 'master_standup',
          label: 'Weekly Standup',
          occurrence_count: 2,
          from_date: '2026-04-01',
          to_date: '2026-04-08',
        }),
      );
    });

    it('limits listing to the requested calendars', async () => {
      const session = createLoadedSession();
      session.loadCalendar('personal', [{ id: 'gym', label: 'Gym', dates: ['2026-03-24'] }], 'ranges');

      const result = await handleToolCall(session, 'list_ranges', { calendars: ['personal'] });
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(1);
      expect(body.ranges[0].range_id).toBe('gym');
      expect(body.calendars).toEqual([{ id: 'personal', effective_window: null }]);
    });

    it('rejects a count_within window with to before from', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-06-01', to: '2026-01-01' },
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain('must not be before');
    });

    it('rejects an oversized label_match pattern and an invalid occurrence_unit', async () => {
      const session = createLoadedSession();

      const longPattern = await handleToolCall(session, 'list_ranges', {
        label_match: 'a'.repeat(257),
      });
      expect(longPattern.isError).toBe(true);
      expect(getTextContent(longPattern)).toContain('at most 256 characters');

      const badUnit = await handleToolCall(session, 'list_ranges', {
        occurrence_unit: 'weeks',
      });
      expect(badUnit.isError).toBe(true);
      expect(getTextContent(badUnit)).toContain('"occurrence_unit" must be "events" or "days"');
    });

    it('rejects a count_within window spanning more than two years', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', {
        count_within: { from: '2026-01-01', to: '2030-01-01' },
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain('must span at most');
    });

    it('truncates rows beyond the limit', async () => {
      const session = createLoadedSession();

      const result = await handleToolCall(session, 'list_ranges', { limit: 2 });
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.total).toBe(4);
      expect(body.ranges).toHaveLength(2);
      expect(body.truncated).toBe(true);
      expect(body.message).toContain('Showing 2 of 4');
    });

    it('reports the stored effective window for ics calendars', async () => {
      const session = new CalendarSession('UTC');
      const icsText = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:planning-1',
        'SUMMARY:Planning Day',
        'DTSTART;VALUE=DATE:20260415',
        'DTEND;VALUE=DATE:20260416',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n');

      const loadResult = await handleToolCall(session, 'load_calendar', {
        source: 'ics',
        data: icsText,
        id: 'school',
        window_from: '2026-04-01',
        window_to: '2026-04-30',
      });
      expect(loadResult.isError).toBeUndefined();

      const result = await handleToolCall(session, 'list_ranges', {});
      const body = parseJsonContent<ListRangesResponse>(result);

      expect(body.calendars).toEqual([
        { id: 'school', effective_window: { from: '2026-04-01', to: '2026-04-30' } },
      ]);
      expect(body.ranges[0]).toEqual(
        expect.objectContaining({ range_id: 'planning-1', label: 'Planning Day' }),
      );
    });

    it('rejects unknown calendar ids and invalid group_by values', async () => {
      const session = createLoadedSession();

      const unknownCalendar = await handleToolCall(session, 'list_ranges', {
        calendars: ['missing'],
      });
      expect(unknownCalendar.isError).toBe(true);

      const badGroupBy = await handleToolCall(session, 'list_ranges', { group_by: 'label' });
      expect(badGroupBy.isError).toBe(true);
    });

    it('returns an empty listing for an empty session', async () => {
      const session = new CalendarSession('UTC');

      const result = await handleToolCall(session, 'list_ranges', {});

      expect(parseJsonContent<ListRangesResponse>(result)).toEqual({
        ranges: [],
        total: 0,
        timezone: 'UTC',
        calendars: [],
      });
    });
  });

  it('finds conflicts within a date window', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'find_conflicts', {
      from: '2026-03-24',
      to: '2026-03-26',
    });
    const conflicts = parseJsonContent<{
      conflicts: Array<{
        date: string;
        overlapStart: string | null;
        overlapEnd: string | null;
        rangeA: { id: string; label: string };
        rangeB: { id: string; label: string };
      }>;
      total: number;
    }>(result);

    expect(conflicts.total).toBe(1);
    expect(conflicts.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-03-25',
          overlapStart: '09:15',
          overlapEnd: '09:30',
        }),
      ]),
    );
  });

  it('finds free slots within custom day bounds', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'find_free_slots', {
      date: '2026-03-25',
      day_start: '08:00',
      day_end: '18:00',
    });
    const freeSlots = parseJsonContent<{
      free_slots: FreeSlot[];
      total: number;
    }>(result);

    expect(freeSlots).toEqual({
      free_slots: [
        {
          date: '2026-03-25',
          startTime: '08:00',
          endTime: '09:00',
          duration: 60,
        },
        {
          date: '2026-03-25',
          startTime: '10:00',
          endTime: '18:00',
          duration: 480,
        },
      ],
      total: 2,
    });
  });

  it('truncates free-slot results when limit is smaller than the full result set', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'find_free_slots', {
      date: '2026-03-25',
      day_start: '08:00',
      day_end: '18:00',
      limit: 1,
    });

    expect(
      parseJsonContent<{
        free_slots: FreeSlot[];
        total: number;
        truncated: boolean;
        message: string;
      }>(result),
    ).toEqual(
      expect.objectContaining({
        free_slots: [
          {
            date: '2026-03-25',
            startTime: '08:00',
            endTime: '09:00',
            duration: 60,
          },
        ],
        total: 2,
        truncated: true,
        message: expect.stringContaining('Showing 1 of 2'),
      }),
    );
  });

  it('finds shared events across multiple calendars by UID', async () => {
    const session = new CalendarSession('UTC');

    await handleToolCall(session, 'load_calendar', {
      source: 'ics',
      data: loadIcsFixture('shared-meetings-alice.ics'),
      id: 'alice',
      window_from: '2026-04-01',
      window_to: '2026-04-30',
    });
    await handleToolCall(session, 'load_calendar', {
      source: 'ics',
      data: loadIcsFixture('shared-meetings-bob.ics'),
      id: 'bob',
      window_from: '2026-04-01',
      window_to: '2026-04-30',
    });

    const result = await handleToolCall(session, 'find_shared_events', {
      calendars: ['alice', 'bob'],
      from: '2026-04-01',
      to: '2026-04-30',
    });

    expect(
      parseJsonContent<{
        shared_events: Array<{
          id: string;
          label: string;
          startTime?: string;
          endTime?: string;
          recurrence_summary?: string;
          found_in_calendars: string[];
          attendees?: Array<{ email: string; role?: string; status?: string }>;
          organizer?: { email: string; name?: string };
        }>;
        total: number;
        calendars_compared: string[];
      }>(result),
    ).toEqual({
      shared_events: [
        {
          id: 'shared-sync',
          label: 'Shared Sync',
          startTime: '15:00',
          endTime: '16:00',
          found_in_calendars: ['alice', 'bob'],
          attendees: [
            {
              email: 'alice@example.com',
              name: 'Alice Example',
              role: 'required',
              status: 'accepted',
            },
            {
              email: 'bob@example.com',
              name: 'Bob Example',
              role: 'optional',
              status: 'tentative',
            },
          ],
          organizer: {
            email: 'alice@example.com',
            name: 'Alice Example',
          },
        },
        {
          id: 'shared-weekly',
          label: 'Shared Weekly',
          startTime: '14:00',
          endTime: '14:30',
          recurrence_summary: 'weekly on Mon',
          found_in_calendars: ['alice', 'bob'],
          attendees: [
            {
              email: 'alice@example.com',
              name: 'Alice Example',
              role: 'required',
              status: 'accepted',
            },
            {
              email: 'bob@example.com',
              name: 'Bob Example',
              role: 'required',
              status: 'needs-action',
            },
          ],
          organizer: {
            email: 'alice@example.com',
            name: 'Alice Example',
          },
        },
      ],
      total: 2,
      calendars_compared: ['alice', 'bob'],
    });
  });

  it('returns no shared events when calendars do not overlap by UID', async () => {
    const session = createLoadedSession();

    session.loadCalendar(
      'personal',
      [
        {
          id: 'gym',
          label: 'Gym',
          dates: ['2026-03-25'],
          startTime: '18:00',
          endTime: '19:00',
          duration: 60,
        },
      ],
      'ranges',
    );

    const result = await handleToolCall(session, 'find_shared_events', {
      calendars: ['work', 'personal'],
    });

    expect(
      parseJsonContent<{
        shared_events: unknown[];
        total: number;
        calendars_compared: string[];
      }>(result),
    ).toEqual({
      shared_events: [],
      total: 0,
      calendars_compared: ['work', 'personal'],
    });
  });

  it('filters shared events by the requested date window', async () => {
    const session = new CalendarSession('UTC');

    await handleToolCall(session, 'load_calendar', {
      source: 'ics',
      data: loadIcsFixture('shared-meetings-alice.ics'),
      id: 'alice',
      window_from: '2026-04-01',
      window_to: '2026-04-30',
    });
    await handleToolCall(session, 'load_calendar', {
      source: 'ics',
      data: loadIcsFixture('shared-meetings-bob.ics'),
      id: 'bob',
      window_from: '2026-04-01',
      window_to: '2026-04-30',
    });

    const result = await handleToolCall(session, 'find_shared_events', {
      calendars: ['alice', 'bob'],
      from: '2026-04-02',
      to: '2026-04-02',
    });

    expect(
      parseJsonContent<{
        shared_events: Array<{
          id: string;
          label: string;
          startTime: string;
          endTime: string;
          found_in_calendars: string[];
          attendees: Array<{
            email: string;
            name?: string;
            role?: string;
            status?: string;
          }>;
          organizer: { email: string; name?: string };
        }>;
        total: number;
        calendars_compared: string[];
      }>(result),
    ).toEqual({
      shared_events: [
        {
          id: 'shared-sync',
          label: 'Shared Sync',
          startTime: '15:00',
          endTime: '16:00',
          found_in_calendars: ['alice', 'bob'],
          attendees: [
            {
              email: 'alice@example.com',
              name: 'Alice Example',
              role: 'required',
              status: 'accepted',
            },
            {
              email: 'bob@example.com',
              name: 'Bob Example',
              role: 'optional',
              status: 'tentative',
            },
          ],
          organizer: {
            email: 'alice@example.com',
            name: 'Alice Example',
          },
        },
      ],
      total: 1,
      calendars_compared: ['alice', 'bob'],
    });
  });

  it('finds common availability across calendars over a date range', async () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar(
      'alice',
      [
        {
          id: 'alice-sync',
          label: 'Alice Sync',
          dates: ['2026-04-02'],
          startTime: '09:00',
          endTime: '10:00',
          duration: 60,
        },
        {
          id: 'alice-focus',
          label: 'Alice Focus',
          dates: ['2026-04-02'],
          startTime: '13:00',
          endTime: '14:00',
          duration: 60,
        },
      ],
      'ranges',
    );
    session.loadCalendar(
      'bob',
      [
        {
          id: 'bob-standup',
          label: 'Bob Standup',
          dates: ['2026-04-02'],
          startTime: '10:30',
          endTime: '11:30',
          duration: 60,
        },
        {
          id: 'bob-review',
          label: 'Bob Review',
          dates: ['2026-04-03'],
          startTime: '09:00',
          endTime: '17:00',
          duration: 480,
        },
      ],
      'ranges',
    );

    const result = await handleToolCall(session, 'find_common_availability', {
      calendars: ['alice', 'bob'],
      from: '2026-04-02',
      to: '2026-04-03',
      min_duration: 30,
      day_start: '09:00',
      day_end: '17:00',
    });

    expect(
      parseJsonContent<{
        common_slots: Array<{
          date: string;
          start: string;
          end: string;
          duration_minutes: number;
        }>;
        total: number;
        calendars_checked: string[];
        search_window: { from: string; to: string };
      }>(result),
    ).toEqual({
      common_slots: [
        {
          date: '2026-04-02',
          start: '10:00',
          end: '10:30',
          duration_minutes: 30,
        },
        {
          date: '2026-04-02',
          start: '11:30',
          end: '13:00',
          duration_minutes: 90,
        },
        {
          date: '2026-04-02',
          start: '14:00',
          end: '17:00',
          duration_minutes: 180,
        },
      ],
      total: 3,
      calendars_checked: ['alice', 'bob'],
      search_window: {
        from: '2026-04-02',
        to: '2026-04-03',
      },
    });
  });

  it('respects min_duration and day bounds for common availability', async () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar(
      'alice',
      [
        {
          id: 'alice-morning',
          label: 'Alice Morning',
          dates: ['2026-04-02'],
          startTime: '09:00',
          endTime: '09:45',
          duration: 45,
        },
      ],
      'ranges',
    );
    session.loadCalendar(
      'bob',
      [
        {
          id: 'bob-afternoon',
          label: 'Bob Afternoon',
          dates: ['2026-04-02'],
          startTime: '12:15',
          endTime: '13:00',
          duration: 45,
        },
      ],
      'ranges',
    );

    const result = await handleToolCall(session, 'find_common_availability', {
      calendars: ['alice', 'bob'],
      from: '2026-04-02',
      to: '2026-04-02',
      min_duration: 60,
      day_start: '10:00',
      day_end: '14:00',
    });

    expect(
      parseJsonContent<{
        common_slots: Array<{
          date: string;
          start: string;
          end: string;
          duration_minutes: number;
        }>;
        total: number;
      }>(result),
    ).toEqual({
      common_slots: [
        {
          date: '2026-04-02',
          start: '10:00',
          end: '12:15',
          duration_minutes: 135,
        },
        {
          date: '2026-04-02',
          start: '13:00',
          end: '14:00',
          duration_minutes: 60,
        },
      ],
      total: 2,
      calendars_checked: ['alice', 'bob'],
      search_window: {
        from: '2026-04-02',
        to: '2026-04-02',
      },
    });
  });

  it('returns no common availability when calendars fully cover the search window', async () => {
    const session = new CalendarSession('UTC');

    session.loadCalendar(
      'alice',
      [
        {
          id: 'alice-day',
          label: 'Alice Day',
          dates: ['2026-04-02'],
          startTime: '09:00',
          endTime: '17:00',
          duration: 480,
        },
      ],
      'ranges',
    );
    session.loadCalendar(
      'bob',
      [
        {
          id: 'bob-day',
          label: 'Bob Day',
          dates: ['2026-04-02'],
          startTime: '09:00',
          endTime: '17:00',
          duration: 480,
        },
      ],
      'ranges',
    );

    const result = await handleToolCall(session, 'find_common_availability', {
      calendars: ['alice', 'bob'],
      from: '2026-04-02',
      to: '2026-04-02',
      day_start: '09:00',
      day_end: '17:00',
    });

    expect(
      parseJsonContent<{
        common_slots: Array<{
          date: string;
          start: string;
          end: string;
          duration_minutes: number;
        }>;
        total: number;
        calendars_checked: string[];
        search_window: { from: string; to: string };
      }>(result),
    ).toEqual({
      common_slots: [],
      total: 0,
      calendars_checked: ['alice', 'bob'],
      search_window: {
        from: '2026-04-02',
        to: '2026-04-02',
      },
    });
  });

  it('finds the next free slot matching a required duration', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'find_next_free_slot', {
      from: '2026-03-25',
      to: '2026-03-26',
      duration: 60,
      day_start: '09:00',
      day_end: '17:00',
    });

    expect(parseJsonContent<FreeSlot | null>(result)).toEqual({
      date: '2026-03-25',
      startTime: '10:00',
      endTime: '17:00',
      duration: 420,
    });
  });

  it('scores a schedule window', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'score_schedule', {
      from: '2026-03-24',
      to: '2026-03-28',
    });
    const score = parseJsonContent<ScheduleScore>(result);

    expect(score).toEqual(
      expect.objectContaining({
        conflicts: expect.any(Number),
        freeMinutes: expect.any(Number),
        focusBlocks: expect.any(Number),
        avgContextSwitches: expect.any(Number),
        conflictDays: expect.any(Number),
      }),
    );
  });

  it('returns all-day and timed day detail views', async () => {
    const session = createLoadedSession();

    const holidayResult = await handleToolCall(session, 'day_detail', {
      date: '2026-03-21',
    });
    const holidayDetail = parseJsonContent<{
      timeSlots: TimeSlot[];
      allDayRanges: DayRangeInfo[];
      total: number;
      total_time_slots: number;
    }>(holidayResult);

    expect(holidayDetail.total).toBe(0);
    expect(holidayDetail.total_time_slots).toBe(0);
    expect(holidayDetail.allDayRanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rangeId: 'holiday',
          label: 'Holiday',
        }),
      ]),
    );

    const workdayResult = await handleToolCall(session, 'day_detail', {
      date: '2026-03-25',
    });
    const workdayDetail = parseJsonContent<{
      timeSlots: TimeSlot[];
      allDayRanges: DayRangeInfo[];
      total: number;
      total_time_slots: number;
    }>(workdayResult);

    expect(workdayDetail.total).toBe(2);
    expect(workdayDetail.total_time_slots).toBe(2);
    expect(workdayDetail.timeSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rangeId: 'standup',
          label: 'Daily Standup',
          startTime: '09:00',
          endTime: '09:30',
        }),
        expect.objectContaining({
          rangeId: 'review',
          label: 'Code Review',
          startTime: '09:15',
          endTime: '10:00',
        }),
      ]),
    );
  });

  it('truncates timed slots in day_detail while preserving all-day ranges', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'day_detail', {
      date: '2026-03-25',
      limit: 1,
    });

    expect(
      parseJsonContent<{
        timeSlots: TimeSlot[];
        allDayRanges: DayRangeInfo[];
        total: number;
        total_time_slots: number;
        truncated: boolean;
        message: string;
      }>(result),
    ).toEqual(
      expect.objectContaining({
        timeSlots: [expect.objectContaining({ rangeId: 'standup' })],
        allDayRanges: [],
        total: 2,
        total_time_slots: 2,
        truncated: true,
        message: expect.stringContaining('Showing 1 of 2'),
      }),
    );
  });

  it('expands a stored range into matching occurrences', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'expand_range', {
      range_id: 'standup',
      from: '2026-03-23',
      to: '2026-03-27',
    });
    const occurrences = parseJsonContent<{
      occurrences: Occurrence[];
      total: number;
    }>(result);

    expect(occurrences).toEqual({
      occurrences: [
        expect.objectContaining({ date: '2026-03-23' }),
        expect.objectContaining({ date: '2026-03-24' }),
        expect.objectContaining({ date: '2026-03-25' }),
        expect.objectContaining({ date: '2026-03-26' }),
        expect.objectContaining({ date: '2026-03-27' }),
      ],
      total: 5,
    });
  });

  it('truncates expanded occurrences when limit is smaller than the expansion size', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'expand_range', {
      range_id: 'standup',
      from: '2026-03-23',
      to: '2026-03-27',
      limit: 2,
    });

    expect(
      parseJsonContent<{
        occurrences: Occurrence[];
        total: number;
        truncated: boolean;
        message: string;
      }>(result),
    ).toEqual(
      expect.objectContaining({
        occurrences: [
          expect.objectContaining({ date: '2026-03-23' }),
          expect.objectContaining({ date: '2026-03-24' }),
        ],
        total: 5,
        truncated: true,
        message: expect.stringContaining('Showing 2 of 5'),
      }),
    );
  });

  it('lists no calendars for an empty session', async () => {
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'list_calendars');

    expect(parseJsonContent(result)).toEqual([]);
  });

  it('suggests changes without mutating session state', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'suggest_changes', {
      changes: [
        {
          action: 'move',
          range_id: 'review',
          updates: {
            startTime: '10:30',
            endTime: '11:15',
          },
          reason: 'Avoid the standup overlap',
        },
      ],
    });

    const suggestion = parseJsonContent<{
      before: { score: ScheduleScore; conflicts: number };
      after: { score: ScheduleScore; conflicts: number };
      changes_applied: number;
    }>(result);

    expect(suggestion.changes_applied).toBe(1);
    expect(suggestion.before.score).toEqual(
      expect.objectContaining({
        conflicts: expect.any(Number),
        freeMinutes: expect.any(Number),
      }),
    );
    expect(suggestion.before.conflicts).toBeGreaterThan(0);
    expect(suggestion.after.conflicts).toBe(0);

    const dayDetail = await handleToolCall(session, 'day_detail', {
      date: '2026-03-25',
    });
    const detail = parseJsonContent<{
      timeSlots: TimeSlot[];
      allDayRanges: DayRangeInfo[];
    }>(dayDetail);

    expect(detail.timeSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rangeId: 'review',
          startTime: '09:15',
          endTime: '10:00',
        }),
      ]),
    );
  });

  it('applies moved ranges to the current session', async () => {
    const session = createLoadedSession();

    const applyResult = await handleToolCall(session, 'apply_changes', {
      changes: [
        {
          action: 'move',
          range_id: 'review',
          updates: {
            startTime: '10:30',
            endTime: '11:15',
          },
          reason: 'Avoid the standup overlap',
        },
      ],
    });

    expect(
      parseJsonContent<{ changes_applied: number; total_ranges: number }>(applyResult),
    ).toEqual({
      changes_applied: 1,
      total_ranges: 4,
    });

    const conflictsResult = await handleToolCall(session, 'find_conflicts', {
      from: '2026-03-24',
      to: '2026-03-26',
    });

    expect(parseJsonContent<{ conflicts: unknown[]; total: number }>(conflictsResult)).toEqual({
      conflicts: [],
      total: 0,
    });
  });

  it('adds new ranges through apply_changes', async () => {
    const session = createLoadedSession();

    await handleToolCall(session, 'apply_changes', {
      changes: [
        {
          action: 'add',
          new_range: {
            id: 'focus',
            label: 'Focus Time',
            dates: ['2026-03-26'],
            startTime: '11:00',
            endTime: '12:00',
            duration: 60,
          },
          reason: 'Reserve focused work time',
        },
      ],
    });

    const calendarsResult = await handleToolCall(session, 'list_calendars');
    expect(
      parseJsonContent<
        Array<{
          id: string;
          rangeCount: number;
          labels: string[];
          has_more_labels: boolean;
        }>
      >(calendarsResult),
    ).toEqual([
      expect.objectContaining({
        id: 'work',
        rangeCount: 5,
        labels: expect.arrayContaining(['Focus Time']),
        has_more_labels: false,
      }),
    ]);
  });

  it('removes ranges through apply_changes', async () => {
    const session = createLoadedSession();

    await handleToolCall(session, 'apply_changes', {
      changes: [
        {
          action: 'remove',
          range_id: 'holiday',
          reason: 'Holiday was cancelled',
        },
      ],
    });

    const result = await handleToolCall(session, 'day_detail', {
      date: '2026-03-21',
    });

    expect(
      parseJsonContent<{
        timeSlots: TimeSlot[];
        allDayRanges: DayRangeInfo[];
        total: number;
        total_time_slots: number;
      }>(result),
    ).toEqual({
      timeSlots: [],
      allDayRanges: [],
      total: 0,
      total_time_slots: 0,
    });
  });

  it('generates ICS output from loaded data', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'generate_ics', {
      calendar_name: 'Work Schedule',
    });
    const ics = getTextContent(result);

    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('X-WR-CALNAME:Work Schedule');
  });

  it('returns errors for invalid load and expand requests', async () => {
    const session = createLoadedSession();

    const missingRange = await handleToolCall(session, 'expand_range', {
      range_id: 'missing',
      from: '2026-03-23',
      to: '2026-03-27',
    });

    expect(missingRange.isError).toBe(true);
    expect(getTextContent(missingRange)).toContain('Range "missing" was not found');

    const invalidLoad = await handleToolCall(session, 'load_calendar', {
      source: 'unknown',
      data: JSON.stringify(testRanges),
    });

    expect(invalidLoad.isError).toBe(true);
    expect(getTextContent(invalidLoad)).toContain(
      '"source" must be "ics", "ranges", "gcal", or "msft".',
    );
  });
});
