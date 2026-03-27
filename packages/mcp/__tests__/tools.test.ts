import type {
  DateRange,
  DayRangeInfo,
  FreeSlot,
  Occurrence,
  ScheduleScore,
  TimeSlot,
} from '@neo-reckoning/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
    fixedBetween: true,
  },
];

function getTextContent(result: CallToolResult): string {
  const entry = result.content.find(item => item.type === 'text');
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

  it('lists loaded calendars with range counts and labels', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'list_calendars');

    expect(
      parseJsonContent<Array<{ id: string; rangeCount: number; labels: string[]; has_more_labels: boolean }>>(result),
    ).toEqual([
      {
        id: 'work',
        rangeCount: 4,
        labels: ['Daily Standup', 'Code Review', 'Holiday', 'Sprint Planning'],
        has_more_labels: false,
      },
    ]);
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
    const freeSlots = parseJsonContent<{ free_slots: FreeSlot[]; total: number }>(result);

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

    expect(parseJsonContent<{ free_slots: FreeSlot[]; total: number; truncated: boolean; message: string }>(result)).toEqual(
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
    const occurrences = parseJsonContent<{ occurrences: Occurrence[]; total: number }>(result);

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
      parseJsonContent<{ occurrences: Occurrence[]; total: number; truncated: boolean; message: string }>(result),
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

    const dayDetail = await handleToolCall(session, 'day_detail', { date: '2026-03-25' });
    const detail = parseJsonContent<{ timeSlots: TimeSlot[]; allDayRanges: DayRangeInfo[] }>(dayDetail);

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

    expect(parseJsonContent<{ changes_applied: number; total_ranges: number }>(applyResult)).toEqual({
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
      parseJsonContent<Array<{ id: string; rangeCount: number; labels: string[]; has_more_labels: boolean }>>(
        calendarsResult,
      ),
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

    expect(parseJsonContent<{ timeSlots: TimeSlot[]; allDayRanges: DayRangeInfo[]; total: number; total_time_slots: number }>(result)).toEqual({
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
    expect(getTextContent(invalidLoad)).toContain('"source" must be either "ics" or "ranges".');
  });
});
