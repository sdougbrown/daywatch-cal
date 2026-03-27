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
    });

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent<{ calendars_loaded: number; ranges_loaded: number; calendar_id: string }>(result)).toEqual({
      calendars_loaded: 1,
      ranges_loaded: 4,
      calendar_id: 'work',
    });
  });

  it('lists loaded calendars with range counts and labels', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'list_calendars');

    expect(parseJsonContent<Array<{ id: string; rangeCount: number; labels: string[] }>>(result)).toEqual([
      {
        id: 'work',
        rangeCount: 4,
        labels: ['Daily Standup', 'Code Review', 'Holiday', 'Sprint Planning'],
      },
    ]);
  });

  it('finds conflicts within a date window', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'find_conflicts', {
      from: '2026-03-24',
      to: '2026-03-26',
    });
    const conflicts = parseJsonContent<
      Array<{
        date: string;
        overlapStart: string | null;
        overlapEnd: string | null;
        rangeA: { id: string; label: string };
        rangeB: { id: string; label: string };
      }>
    >(result);

    expect(conflicts).toEqual(
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
    const freeSlots = parseJsonContent<FreeSlot[]>(result);

    expect(freeSlots).toEqual([
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
    ]);
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
    const holidayDetail = parseJsonContent<{ timeSlots: TimeSlot[]; allDayRanges: DayRangeInfo[] }>(
      holidayResult,
    );

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
    const workdayDetail = parseJsonContent<{ timeSlots: TimeSlot[]; allDayRanges: DayRangeInfo[] }>(
      workdayResult,
    );

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

  it('expands a stored range into matching occurrences', async () => {
    const session = createLoadedSession();

    const result = await handleToolCall(session, 'expand_range', {
      range_id: 'standup',
      from: '2026-03-23',
      to: '2026-03-27',
    });
    const occurrences = parseJsonContent<Occurrence[]>(result);

    expect(occurrences.map(occurrence => occurrence.date)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
    ]);
  });

  it('lists no calendars for an empty session', async () => {
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'list_calendars');

    expect(parseJsonContent(result)).toEqual([]);
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
