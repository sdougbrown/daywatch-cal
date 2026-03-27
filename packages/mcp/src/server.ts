import {
  RangeEvaluator,
  scoreSchedule,
  type DateRange,
  type DayRangeInfo,
  type TimeSlot,
} from '@neo-reckoning/core';
import { detectDataWindow, generateICS, parseICS } from '@neo-reckoning/ical';
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
find_free_slots defaults to 09:00-17:00 working hours.

LARGE CALENDARS:
- Use window_from/window_to in load_calendar to limit the parse range.
- load_calendar returns effective_window so you can see what dates were actually loaded.
- Query narrow date ranges (1-2 weeks) instead of broad multi-month windows.
- Use day_detail for single-day deep dives.
- find_conflicts, find_free_slots, day_detail, and expand_range accept a limit parameter.`;

const PROPOSED_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['move', 'add', 'remove'],
      description: 'Whether to move, add, or remove a range.',
    },
    range_id: {
      type: 'string',
      description: 'The range id to mutate for move/remove actions.',
    },
    updates: {
      type: 'object',
      properties: {
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        date: { type: 'string' },
        fromDate: { type: 'string' },
        toDate: { type: 'string' },
      },
      description: 'Updated values to apply to an existing range.',
    },
    new_range: {
      type: 'object',
      description: 'A new DateRange to add for add actions.',
    },
    reason: {
      type: 'string',
      description: 'Human-readable rationale for the proposed change.',
    },
  },
  required: ['action', 'reason'],
} as const;

export const TOOLS: Tool[] = [
  {
    name: 'load_calendar',
    description:
      'Load calendar data from .ics text or DateRange[] JSON into the current session. Tip: set window_from/window_to to limit the parse range for large calendars.',
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
        window_from: {
          type: 'string',
          description: 'Optional parse window start date (YYYY-MM-DD). Must be paired with window_to.',
        },
        window_to: {
          type: 'string',
          description: 'Optional parse window end date (YYYY-MM-DD). Must be paired with window_from.',
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
        limit: {
          type: 'number',
          description: 'Maximum conflicts to return. Defaults to 50.',
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
        limit: {
          type: 'number',
          description: 'Maximum free slots to return. Defaults to 50.',
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
        limit: {
          type: 'number',
          description: 'Maximum timed slots to return. Defaults to 50.',
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
        limit: {
          type: 'number',
          description: 'Maximum occurrences to return. Defaults to 50.',
        },
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
  {
    name: 'suggest_changes',
    description: 'Preview schedule changes with before/after scoring and conflict counts without mutating session state.',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: PROPOSED_CHANGE_SCHEMA,
          description: 'Proposed change set to evaluate against the current session.',
        },
        from: {
          type: 'string',
          description: 'Optional scoring window start date. Defaults to earliest affected date minus 7 days.',
        },
        to: {
          type: 'string',
          description: 'Optional scoring window end date. Defaults to latest affected date plus 7 days.',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'apply_changes',
    description: 'Apply schedule changes to the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: PROPOSED_CHANGE_SCHEMA,
          description: 'Proposed change set to apply to the current session.',
        },
      },
      required: ['changes'],
    },
  },
  {
    name: 'generate_ics',
    description: 'Export loaded calendar data as .ics text.',
    inputSchema: {
      type: 'object',
      properties: {
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of calendar ids to export.',
        },
        calendar_name: {
          type: 'string',
          description: 'Optional calendar name to set as X-WR-CALNAME.',
        },
      },
    },
  },
];

interface ProposedChangeUpdates {
  startTime?: string;
  endTime?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
}

interface ProposedChange {
  action: 'move' | 'add' | 'remove';
  range_id?: string;
  updates?: ProposedChangeUpdates;
  new_range?: DateRange;
  reason: string;
}

function jsonResult(value: unknown): CallToolResult {
  const compact = JSON.stringify(value);
  const text = compact.length > 4000 ? compact : JSON.stringify(value, null, 2);

  return {
    content: [
      {
        type: 'text',
        text,
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

function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
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

function optionalLimit(args: Record<string, unknown>, fallback = 50): number {
  const value = optionalNumber(args, 'limit', fallback);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('"limit" must be a non-negative integer when provided.');
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

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`"${label}" must be an object.`);
  }

  return value as Record<string, unknown>;
}

function cloneRange(range: DateRange): DateRange {
  return structuredClone(range);
}

function parseProposedChangeUpdates(value: unknown): ProposedChangeUpdates | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, 'updates');
  return {
    startTime: optionalString(record, 'startTime'),
    endTime: optionalString(record, 'endTime'),
    date: optionalString(record, 'date'),
    fromDate: optionalString(record, 'fromDate'),
    toDate: optionalString(record, 'toDate'),
  };
}

function parseNewRange(value: unknown): DateRange | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, 'new_range');
  const id = requireString(record, 'id');
  const label = requireString(record, 'label');

  return {
    ...record,
    id,
    label,
  } as DateRange;
}

function parseProposedChanges(args: Record<string, unknown>): ProposedChange[] {
  const value = args.changes;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('"changes" must be a non-empty array.');
  }

  return value.map((item, index) => {
    const record = requireRecord(item, `changes[${index}]`);
    const action = requireString(record, 'action');
    const reason = requireString(record, 'reason');

    if (action !== 'move' && action !== 'add' && action !== 'remove') {
      throw new Error(`changes[${index}].action must be "move", "add", or "remove".`);
    }

    return {
      action,
      range_id: optionalString(record, 'range_id'),
      updates: parseProposedChangeUpdates(record.updates),
      new_range: parseNewRange(record.new_range),
      reason,
    };
  });
}

function parseDateArgument(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatWindow(window: { from: Date; to: Date }): { from: string; to: string } {
  return {
    from: formatDateValue(window.from),
    to: formatDateValue(window.to),
  };
}

function truncateArray<T>(items: T[], key: string, limit: number): Record<string, unknown> {
  const truncated = items.length > limit;

  return {
    [key]: items.slice(0, limit),
    total: items.length,
    ...(truncated
      ? {
          truncated: true,
          message: `Showing ${limit} of ${items.length}. Use a narrower window or increase limit.`,
        }
      : {}),
  };
}

function collectUniqueLabels(ranges: DateRange[], limit: number): { labels: string[]; hasMore: boolean } {
  const labels = [...new Set(ranges.map(range => range.label))];
  return {
    labels: labels.slice(0, limit),
    hasMore: labels.length > limit,
  };
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

function findRangeById(ranges: DateRange[], rangeId: string): DateRange | undefined {
  return ranges.find(range => range.id === rangeId);
}

function applyDateUpdate(range: DateRange, date: string): DateRange {
  if (range.dates?.length) {
    if (range.dates.length !== 1) {
      throw new Error(`Range "${range.id}" cannot apply a single "date" update because it has multiple explicit dates.`);
    }

    return {
      ...range,
      dates: [date],
      fromDate: undefined,
      toDate: undefined,
    };
  }

  if (range.fromDate !== undefined || range.toDate !== undefined) {
    return {
      ...range,
      dates: undefined,
      fromDate: range.fromDate !== undefined ? date : range.fromDate,
      toDate: range.toDate !== undefined ? date : range.toDate,
    };
  }

  return {
    ...range,
    dates: [date],
    fromDate: undefined,
    toDate: undefined,
  };
}

function applyMoveToRange(range: DateRange, updates?: ProposedChangeUpdates): DateRange {
  if (!updates) {
    throw new Error(`Move change for range "${range.id}" is missing "updates".`);
  }

  let nextRange = cloneRange(range);
  if (updates.date) {
    nextRange = applyDateUpdate(nextRange, updates.date);
  }

  const { date: _date, ...rest } = updates;
  return {
    ...nextRange,
    ...rest,
  };
}

function applyChangesToRanges(ranges: DateRange[], changes: ProposedChange[]): { ranges: DateRange[]; changesApplied: number } {
  let nextRanges = ranges.map(cloneRange);
  let changesApplied = 0;

  for (const change of changes) {
    switch (change.action) {
      case 'move': {
        if (!change.range_id) {
          throw new Error('Move changes require "range_id".');
        }

        const index = nextRanges.findIndex(range => range.id === change.range_id);
        if (index === -1) {
          throw new Error(`Range "${change.range_id}" was not found in the current session.`);
        }

        nextRanges[index] = applyMoveToRange(nextRanges[index], change.updates);
        changesApplied += 1;
        break;
      }

      case 'add': {
        if (!change.new_range) {
          throw new Error('Add changes require "new_range".');
        }

        nextRanges = [...nextRanges, cloneRange(change.new_range)];
        changesApplied += 1;
        break;
      }

      case 'remove': {
        if (!change.range_id) {
          throw new Error('Remove changes require "range_id".');
        }

        const filteredRanges = nextRanges.filter(range => range.id !== change.range_id);
        if (filteredRanges.length === nextRanges.length) {
          throw new Error(`Range "${change.range_id}" was not found in the current session.`);
        }

        nextRanges = filteredRanges;
        changesApplied += 1;
        break;
      }
    }
  }

  return { ranges: nextRanges, changesApplied };
}

function getRangeDateWindow(range: DateRange): { from: string; to: string } | undefined {
  if (range.dates?.length) {
    const sortedDates = [...range.dates].sort();
    return {
      from: sortedDates[0],
      to: sortedDates[sortedDates.length - 1],
    };
  }

  const dates = [range.fromDate, range.toDate].filter((value): value is string => Boolean(value)).sort();
  if (dates.length > 0) {
    return {
      from: dates[0],
      to: dates[dates.length - 1],
    };
  }

  return undefined;
}

function getDefaultSuggestionWindow(
  currentRanges: DateRange[],
  changes: ProposedChange[],
): { from: string; to: string } {
  const windows: Array<{ from: string; to: string }> = [];

  for (const change of changes) {
    if (change.action === 'add') {
      if (!change.new_range) {
        throw new Error('Add changes require "new_range".');
      }

      const window = getRangeDateWindow(change.new_range);
      if (window) {
        windows.push(window);
      }
      continue;
    }

    if (!change.range_id) {
      throw new Error(`${change.action === 'move' ? 'Move' : 'Remove'} changes require "range_id".`);
    }

    const range = findRangeById(currentRanges, change.range_id);
    if (!range) {
      throw new Error(`Range "${change.range_id}" was not found in the current session.`);
    }

    const originalWindow = getRangeDateWindow(range);
    if (originalWindow) {
      windows.push(originalWindow);
    }

    if (change.action === 'move') {
      const movedWindow = getRangeDateWindow(applyMoveToRange(range, change.updates));
      if (movedWindow) {
        windows.push(movedWindow);
      }
    }
  }

  if (windows.length === 0) {
    throw new Error('Could not infer a scoring window from the proposed changes. Provide "from" and "to".');
  }

  const earliest = windows.map(window => window.from).sort()[0];
  const latest = windows.map(window => window.to).sort()[windows.length - 1];

  return {
    from: shiftDay(earliest, -7),
    to: shiftDay(latest, 7),
  };
}

function summarizeSchedule(
  evaluator: RangeEvaluator,
  ranges: DateRange[],
  from: string,
  to: string,
): { score: ReturnType<typeof scoreSchedule>; conflicts: number } {
  const fromDate = parseDateArgument(from);
  const toDate = parseDateArgument(to);

  return {
    score: scoreSchedule(evaluator, ranges, fromDate, toDate),
    conflicts: evaluator.findConflictsInWindow(ranges, fromDate, toDate).length,
  };
}

function applyChangesToSession(session: CalendarSession, changes: ProposedChange[]): number {
  let changesApplied = 0;

  for (const change of changes) {
    switch (change.action) {
      case 'move': {
        if (!change.range_id) {
          throw new Error('Move changes require "range_id".');
        }

        const calendarId = session.findRangeCalendar(change.range_id);
        if (!calendarId) {
          throw new Error(`Range "${change.range_id}" was not found in the current session.`);
        }

        const range = findRangeById(session.getAllRanges([calendarId]), change.range_id);
        if (!range) {
          throw new Error(`Range "${change.range_id}" was not found in the current session.`);
        }

        session.updateRange(change.range_id, applyMoveToRange(range, change.updates));
        changesApplied += 1;
        break;
      }

      case 'add': {
        if (!change.new_range) {
          throw new Error('Add changes require "new_range".');
        }

        const firstCalendarId = session.calendars.keys().next().value as string | undefined;
        session.addRange(firstCalendarId ?? 'proposals', cloneRange(change.new_range));
        changesApplied += 1;
        break;
      }

      case 'remove': {
        if (!change.range_id) {
          throw new Error('Remove changes require "range_id".');
        }

        if (!session.removeRange(change.range_id)) {
          throw new Error(`Range "${change.range_id}" was not found in the current session.`);
        }

        changesApplied += 1;
        break;
      }
    }
  }

  return changesApplied;
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
        const windowFrom = optionalString(args, 'window_from');
        const windowTo = optionalString(args, 'window_to');

        if (source !== 'ics' && source !== 'ranges') {
          throw new Error('"source" must be either "ics" or "ranges".');
        }

        if ((windowFrom && !windowTo) || (!windowFrom && windowTo)) {
          throw new Error('"window_from" and "window_to" must be provided together.');
        }

        applyTimezone(session, timezone);

        const requestedWindow =
          windowFrom && windowTo
            ? { from: parseDateArgument(windowFrom), to: parseDateArgument(windowTo) }
            : getParseWindow();

        let ranges: DateRange[];
        let effectiveWindow = requestedWindow;
        let detectedWindow: { from: Date; to: Date } | null = null;

        if (source === 'ics') {
          detectedWindow = detectDataWindow(data);
          ranges = parseICS(data, requestedWindow);

          // If we got very few results but the data lives elsewhere, re-parse
          // with the detected window. Unbounded recurrences (no UNTIL) match
          // any window, so a small result count doesn't mean the window is right.
          if (detectedWindow && ranges.length < 10) {
            const detectedRanges = parseICS(data, detectedWindow);
            if (detectedRanges.length > ranges.length) {
              ranges = detectedRanges;
              effectiveWindow = detectedWindow;
            }
          }
        } else {
          const parsed = JSON.parse(data) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('Range JSON must decode to an array.');
          }

          ranges = parsed as DateRange[];
        }

        const calendarId = session.createCalendarId(id);
        session.loadCalendar(calendarId, ranges, source);
        const labelSummary = collectUniqueLabels(ranges, 20);

        return jsonResult({
          calendars_loaded: session.calendars.size,
          ranges_loaded: ranges.length,
          calendar_id: calendarId,
          effective_window: formatWindow(effectiveWindow),
          detected_data_window: detectedWindow ? formatWindow(detectedWindow) : null,
          sample_labels: labelSummary.labels,
          has_more_labels: labelSummary.hasMore,
        });
      }

      case 'find_conflicts': {
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const ranges = getRanges(session, args);
        const limit = optionalLimit(args);
        const conflicts = session.evaluator.findConflictsInWindow(ranges, parseDateArgument(from), parseDateArgument(to));

        return jsonResult(truncateArray(conflicts, 'conflicts', limit));
      }

      case 'find_free_slots': {
        const date = requireString(args, 'date');
        const ranges = getRanges(session, args);
        const limit = optionalLimit(args);
        const freeSlots = session.evaluator.findFreeSlots(ranges, date, {
          minDuration: optionalNumber(args, 'min_duration', 30),
          dayStart: optionalString(args, 'day_start') ?? '09:00',
          dayEnd: optionalString(args, 'day_end') ?? '17:00',
        });

        return jsonResult(
          truncateArray(freeSlots, 'free_slots', limit),
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
          session.evaluator.findNextFreeSlot(ranges, parseDateArgument(from), parseDateArgument(to), duration, {
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
          scoreSchedule(session.evaluator, ranges, parseDateArgument(from), parseDateArgument(to), {
            focusBlockMinutes: optionalNumber(args, 'focus_block_minutes', 60),
            dayStart: optionalString(args, 'day_start'),
            dayEnd: optionalString(args, 'day_end'),
          }),
        );
      }

      case 'day_detail': {
        const date = requireString(args, 'date');
        const ranges = getRanges(session, args);
        const limit = optionalLimit(args);
        const detail = buildDayDetail(session.evaluator, ranges, date);
        const truncatedTimeSlots = truncateArray(detail.timeSlots, 'timeSlots', limit);

        return jsonResult({
          ...truncatedTimeSlots,
          allDayRanges: detail.allDayRanges,
          total_time_slots: detail.timeSlots.length,
        });
      }

      case 'expand_range': {
        const rangeId = requireString(args, 'range_id');
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const limit = optionalLimit(args);
        const range = session.getAllRanges().find(candidate => candidate.id === rangeId);

        if (!range) {
          throw new Error(`Range "${rangeId}" was not found in the current session.`);
        }

        const occurrences = session.evaluator.expand(range, parseDateArgument(from), parseDateArgument(to));
        return jsonResult(truncateArray(occurrences, 'occurrences', limit));
      }

      case 'list_calendars': {
        return jsonResult(session.getCalendarSummary());
      }

      case 'suggest_changes': {
        const changes = parseProposedChanges(args);
        const currentRanges = session.getAllRanges();
        const defaultWindow = getDefaultSuggestionWindow(currentRanges, changes);
        const from = optionalString(args, 'from') ?? defaultWindow.from;
        const to = optionalString(args, 'to') ?? defaultWindow.to;
        const preview = applyChangesToRanges(currentRanges, changes);

        return jsonResult({
          before: summarizeSchedule(session.evaluator, currentRanges, from, to),
          after: summarizeSchedule(session.evaluator, preview.ranges, from, to),
          changes_applied: preview.changesApplied,
        });
      }

      case 'apply_changes': {
        const changes = parseProposedChanges(args);
        const changesApplied = applyChangesToSession(session, changes);

        return jsonResult({
          changes_applied: changesApplied,
          total_ranges: session.getAllRanges().length,
        });
      }

      case 'generate_ics': {
        const ranges = getRanges(session, args);
        const calendarName = optionalString(args, 'calendar_name');

        return textResult(generateICS(ranges, { calendarName }));
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
