import {
  RangeEvaluator,
  scoreSchedule,
  type DateRange,
  type DayRangeInfo,
  type FreeSlot,
  type TimeSlot,
} from '@neo-reckoning/core';
import { parseICS } from '@neo-reckoning/ical';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { CalendarSession } from './state.js';

const SERVER_INSTRUCTIONS = `Calendar computation tools powered by neo-reckoning. Analyze and optimize schedules - find conflicts, free time, focus blocks, and more.

WORKFLOW:
1. Load calendar data with load_calendar (.ics text or DateRange[] JSON). Load multiple calendars to analyze them together.
2. Analyze with find_conflicts, find_free_slots, score_schedule, etc.

Data persists for the session - load once, query many times.
Dates: YYYY-MM-DD. Times: HH:mm (24-hour).
find_free_slots defaults to 09:00-17:00 working hours.`;

export const TOOLS: Tool[] = [
  {
    name: 'load_calendar',
    description: 'Load calendar data from .ics text or DateRange[] JSON into the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['ics', 'ranges'],
          description: 'Whether data contains .ics text or a JSON DateRange array.',
        },
        data: {
          type: 'string',
          description: 'The .ics calendar text or JSON-encoded DateRange[].',
        },
        id: {
          type: 'string',
          description: 'Optional calendar identifier. Defaults to calendar-N.',
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone to use for the session evaluator.',
        },
      },
      required: ['source', 'data'],
    },
  },
  {
    name: 'find_conflicts',
    description: 'Find timed conflicts across loaded calendars within a date window.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start of the search window as an ISO date.' },
        to: { type: 'string', description: 'End of the search window as an ISO date.' },
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to limit the search.',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'find_free_slots',
    description: 'Find free time slots on a specific day within working-hour bounds.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to analyze, in YYYY-MM-DD format.' },
        min_duration: {
          type: 'number',
          description: 'Minimum free-slot duration in minutes. Defaults to 30.',
        },
        day_start: {
          type: 'string',
          description: 'Start of the day window, in HH:mm format. Defaults to 09:00.',
        },
        day_end: {
          type: 'string',
          description: 'End of the day window, in HH:mm format. Defaults to 17:00.',
        },
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to limit the search.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'find_next_free_slot',
    description: 'Find the next available free slot within a date window.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Search window start as an ISO date.' },
        to: { type: 'string', description: 'Search window end as an ISO date.' },
        duration: { type: 'number', description: 'Required duration in minutes.' },
        day_start: {
          type: 'string',
          description: 'Start of the daily search window, in HH:mm format.',
        },
        day_end: {
          type: 'string',
          description: 'End of the daily search window, in HH:mm format.',
        },
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to limit the search.',
        },
      },
      required: ['from', 'to', 'duration'],
    },
  },
  {
    name: 'score_schedule',
    description: 'Score a schedule window for conflicts, free time, focus blocks, and context switches.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start of the scoring window as an ISO date.' },
        to: { type: 'string', description: 'End of the scoring window as an ISO date.' },
        focus_block_minutes: {
          type: 'number',
          description: 'Minimum uninterrupted free block counted as focus time. Defaults to 60.',
        },
        day_start: {
          type: 'string',
          description: 'Start of the working day, in HH:mm format.',
        },
        day_end: {
          type: 'string',
          description: 'End of the working day, in HH:mm format.',
        },
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to limit the analysis.',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'day_detail',
    description: 'Return timed slots and all-day ranges for a specific day.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date to inspect, in YYYY-MM-DD format.' },
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to limit the analysis.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'expand_range',
    description: 'Expand one stored DateRange into its concrete occurrences within a date window.',
    inputSchema: {
      type: 'object',
      properties: {
        range_id: { type: 'string', description: 'The DateRange id to expand.' },
        from: { type: 'string', description: 'Window start as an ISO date.' },
        to: { type: 'string', description: 'Window end as an ISO date.' },
      },
      required: ['range_id', 'from', 'to'],
    },
  },
  {
    name: 'list_calendars',
    description: 'List loaded calendars with their range counts and labels.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(message: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`"${key}" must be a non-empty string.`);
  }

  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`"${key}" must be a string when provided.`);
  }

  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`"${key}" must be a number when provided.`);
  }

  return value;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`"${key}" must be an array of strings when provided.`);
  }

  return value;
}

function shiftDay(dateStr: string, delta: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const next = new Date(year, month - 1, day + delta);

  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, '0'),
    String(next.getDate()).padStart(2, '0'),
  ].join('-');
}

function buildDayDetail(
  evaluator: RangeEvaluator,
  ranges: DateRange[],
  date: string,
): { timeSlots: TimeSlot[]; allDayRanges: DayRangeInfo[] } {
  const timeSlots: TimeSlot[] = [];
  const allDayRanges: DayRangeInfo[] = [];

  for (const range of ranges) {
    if (!evaluator.isDateInRange(date, range)) {
      continue;
    }

    const slots = evaluator.getTimeSlots(date, range);
    if (slots.length > 0) {
      timeSlots.push(...slots);
      continue;
    }

    const previousDate = shiftDay(date, -1);
    const nextDate = shiftDay(date, 1);
    const previousInRange = evaluator.isDateInRange(previousDate, range);
    const nextInRange = evaluator.isDateInRange(nextDate, range);

    allDayRanges.push({
      rangeId: range.id,
      label: range.label,
      isStart: !previousInRange,
      isEnd: !nextInRange,
      isContinuation: previousInRange && nextInRange,
      ...(range.displayType !== undefined ? { displayType: range.displayType } : {}),
    });
  }

  timeSlots.sort((left, right) => left.startTime.localeCompare(right.startTime));

  return { timeSlots, allDayRanges };
}

function applyTimezone(session: CalendarSession, timezone?: string): void {
  if (!timezone) {
    return;
  }

  session.timezone = timezone;
  session.evaluator = new RangeEvaluator(timezone);
}

function getRanges(session: CalendarSession, args: Record<string, unknown>): DateRange[] {
  return session.getAllRanges(optionalStringArray(args, 'calendars'));
}

function getParseWindow(): { from: Date; to: Date } {
  const from = new Date();
  from.setMonth(from.getMonth() - 1);

  const to = new Date();
  to.setMonth(to.getMonth() + 6);

  return { from, to };
}

export async function handleToolCall(
  session: CalendarSession,
  name: string,
  rawArgs?: Record<string, unknown>,
): Promise<CallToolResult> {
  const args = rawArgs ?? {};

  try {
    switch (name) {
      case 'load_calendar': {
        const source = requireString(args, 'source');
        const data = requireString(args, 'data');
        const id = optionalString(args, 'id');
        const timezone = optionalString(args, 'timezone');

        if (source !== 'ics' && source !== 'ranges') {
          throw new Error('"source" must be either "ics" or "ranges".');
        }

        applyTimezone(session, timezone);

        let ranges: DateRange[];
        if (source === 'ics') {
          ranges = parseICS(data, getParseWindow());
        } else {
          const parsed = JSON.parse(data) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('Range JSON must decode to an array.');
          }

          ranges = parsed as DateRange[];
        }

        const calendarId = session.createCalendarId(id);
        session.loadCalendar(calendarId, ranges, source);

        return jsonResult({
          calendars_loaded: session.calendars.size,
          ranges_loaded: ranges.length,
          calendar_id: calendarId,
        });
      }

      case 'find_conflicts': {
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const ranges = getRanges(session, args);

        return jsonResult(
          session.evaluator.findConflictsInWindow(ranges, new Date(from), new Date(to)),
        );
      }

      case 'find_free_slots': {
        const date = requireString(args, 'date');
        const ranges = getRanges(session, args);

        return jsonResult(
          session.evaluator.findFreeSlots(ranges, date, {
            minDuration: optionalNumber(args, 'min_duration', 30),
            dayStart: optionalString(args, 'day_start') ?? '09:00',
            dayEnd: optionalString(args, 'day_end') ?? '17:00',
          }),
        );
      }

      case 'find_next_free_slot': {
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const duration = optionalNumber(args, 'duration', Number.NaN);
        const ranges = getRanges(session, args);

        if (Number.isNaN(duration)) {
          throw new Error('"duration" must be provided.');
        }

        return jsonResult(
          session.evaluator.findNextFreeSlot(ranges, new Date(from), new Date(to), duration, {
            dayStart: optionalString(args, 'day_start'),
            dayEnd: optionalString(args, 'day_end'),
          }),
        );
      }

      case 'score_schedule': {
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const ranges = getRanges(session, args);

        return jsonResult(
          scoreSchedule(session.evaluator, ranges, new Date(from), new Date(to), {
            focusBlockMinutes: optionalNumber(args, 'focus_block_minutes', 60),
            dayStart: optionalString(args, 'day_start'),
            dayEnd: optionalString(args, 'day_end'),
          }),
        );
      }

      case 'day_detail': {
        const date = requireString(args, 'date');
        const ranges = getRanges(session, args);

        return jsonResult(buildDayDetail(session.evaluator, ranges, date));
      }

      case 'expand_range': {
        const rangeId = requireString(args, 'range_id');
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const range = session.getAllRanges().find(candidate => candidate.id === rangeId);

        if (!range) {
          throw new Error(`Range "${rangeId}" was not found in the current session.`);
        }

        return jsonResult(session.evaluator.expand(range, new Date(from), new Date(to)));
      }

      case 'list_calendars': {
        return jsonResult(session.getCalendarSummary());
      }

      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

export function createServer(session = new CalendarSession()): Server {
  const server = new Server(
    { name: 'neo-reckoning-mcp', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async request =>
    handleToolCall(session, request.params.name, request.params.arguments),
  );

  return server;
}
