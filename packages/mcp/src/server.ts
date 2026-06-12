import { readFileSync } from 'node:fs';
import {
  RangeEvaluator,
  dateRange,
  scoreSchedule,
  type DateRange,
  type DayRangeInfo,
  type TimeSlot,
} from '@daywatch/cal';
import { detectDataWindow, generateICS, parseICS } from '@daywatch/ical';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { VERSION } from './_version.js';
import { gcalEventsToDateRanges } from './adapters/gcal.js';
import { msftEventsToDateRanges } from './adapters/msft.js';
import type { GCalEvent, MsftGraphEvent } from './adapters/types.js';
import { CalendarSession } from './state.js';

const SERVER_INSTRUCTIONS = `Calendar computation engine powered by daywatch-cal. Handles RRULE expansion, timezone math, conflict detection, schedule scoring, and cross-calendar analysis.

WHEN TO USE NEO-RECKONING vs. A CALENDAR MCP (Google Calendar, Outlook, etc.):

If another calendar MCP is available (e.g., Google Calendar, Microsoft Graph), use it directly for simple queries and writes — listing events, creating/updating/deleting events, RSVPing, or finding free time within a single provider. Those MCPs have live API access and handle the basics well.

Use daywatch-cal when the task goes beyond what a single calendar MCP can do:
- CROSS-PROVIDER: Finding availability across people on different calendar systems (Alice on Google + Bob on Outlook + Chris from an .ics export). Load each into daywatch-cal with a distinct ID, then use find_common_availability.
- SCHEDULE QUALITY: score_schedule gives quantified metrics — conflict count, total free time, focus blocks (consecutive free hours), context switches. No calendar MCP offers this.
- WHAT-IF ANALYSIS: "What happens if I move standup to 2pm?" Load the calendar, use suggest_changes to preview the move with before/after scores — without touching the real calendar. Then use the source MCP to apply the winning option.
- CONFLICT DETAIL: find_conflicts returns the specific overlapping events with overlap duration. Calendar FreeBusy APIs only return opaque busy/free blocks.
- .ICS FILES: School calendars, conference schedules, Outlook exports, Apple Calendar exports — load_calendar_file or load_calendar with source "ics" handles RRULE expansion, timezone conversion, and all the edge cases. Never parse .ics in-context.
- RECURRENCE REASONING: Understanding recurrence patterns themselves (not just expanded instances). expand_range shows concrete occurrences; the pattern metadata is preserved for reasoning about schedule structure.
- OFFLINE / NO-AUTH: The user shares calendar data without granting API access. Neo-reckoning works on snapshots — no authentication needed.

TYPICAL AGENT WORKFLOW (when both daywatch-cal and a calendar MCP are available):
1. Fetch data from the source MCP (gcal_list_events, Microsoft Graph, etc.)
2. Load into daywatch-cal: load_calendar(source="gcal", data=<raw JSON>) or source="msft"
3. Analyze with daywatch-cal: find_conflicts, find_common_availability, score_schedule, suggest_changes
4. Act via the source MCP: gcal_create_event, gcal_update_event, etc.

Neo-reckoning is the thinking step between reading and writing. The source MCP is the hands.

LOADING DATA:
- File on disk → load_calendar_file (pass the path). Handles .ics (default) and gcal/msft JSON via the "source" param — use it whenever the data is already on disk (e.g. a list_events result too large to pass inline); never read large calendar files into the conversation yourself.
- Google Calendar → load_calendar with source "gcal" and the raw JSON array from gcal_list_events. Auto-filters transparent, declined, working-location events.
- Microsoft Outlook / Office 365 → load_calendar with source "msft" and the raw JSON array from Microsoft Graph. Auto-filters free, workingElsewhere, declined, cancelled events. Maps Windows timezones to IANA.
- Always feed gcal/msft data through its native source. Do NOT pre-flatten it to "ranges" yourself — you lose the transparency/declined filtering and the per-event timezone reconciliation, both of which silently corrupt scoring (wrong busy/free, events at the wrong wall-clock hour).
- Raw .ics text or pasted data → load_calendar with source "ics"
- Pre-built DateRange JSON → load_calendar with source "ranges"
- Data persists for the session — load once, query many times.
- load_calendar returns effective_window and sample_labels so you know what dates and events were loaded.
- The server auto-detects the right time window for historical calendars (e.g. a past school year).

ANALYZING:
- list_ranges — inventory of what's loaded: range ids, labels, date bounds, recurrence summaries. gcal/msft recurring-event instances are grouped into one row per series. Use this (not your own .ics parsing) to answer "what's in this calendar?"
- find_conflicts — overlapping events in a date range, with overlap details
- find_free_slots — open time on a specific day (defaults to 09:00–17:00)
- find_next_free_slot — first available slot of a given duration
- find_shared_events — meetings appearing in multiple loaded calendars (matched by event UID)
- find_common_availability — free slots across specified calendars over a date range
- score_schedule — quality metrics: conflicts, free time, focus blocks, context switches
- day_detail — full breakdown of a single day (timed slots + all-day events)
- expand_range — concrete occurrences of one recurring event

CROSS-CALENDAR ANALYSIS:
- Load multiple calendars with distinct IDs: load_calendar(id="alice", ...), load_calendar(id="bob", ...)
- Calendars can come from different providers — Google for one person, Outlook for another, .ics for a third
- find_shared_events identifies the same meeting across calendars by event UID
- find_common_availability finds free slots across all specified calendars
- Metadata from the source (attendees, response status, event type) is preserved — check it to understand context
- To reschedule a shared meeting: identify it with find_shared_events, find a new slot with find_common_availability, preview with suggest_changes, then use the source calendar MCP to make the actual change

OPTIMIZING:
- suggest_changes — preview moves/adds/removes with before/after scoring (read-only, does not affect real calendars)
- apply_changes — commit changes to daywatch-cal's session state after user approval
- generate_ics — export current state as .ics for reimport into any calendar app
- After optimizing in daywatch-cal, use the source calendar MCP (gcal_update_event, etc.) to apply changes to the real calendar

FORMATTING:
Dates: YYYY-MM-DD. Times: HH:mm (24-hour).

LARGE CALENDARS:
- Use window_from/window_to to limit the parse range when you know the relevant period.
- Query narrow date ranges (1–2 weeks) rather than broad multi-month windows.
- Use day_detail for single-day deep dives.
- find_conflicts, find_free_slots, day_detail, and expand_range accept a limit parameter.
- If a source list_events result is too big to read back into context, it has almost always been saved to a file on disk — load it directly with load_calendar_file({path, source: "gcal" | "msft"}), which reads the file itself and never routes the contents through the conversation. It accepts either the raw result object ({events: [...]}) or a bare events array. Do NOT trim, flatten, or hand-convert it to fit inline. Only if the data is *not* on disk and must be inlined should you slice it by date window at the source (e.g. jq) and load with its native source — never "ranges".`;

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
          enum: ['ics', 'ranges', 'gcal', 'msft'],
          description:
            'Data format: "ics" for .ics text, "ranges" for JSON DateRange array, "gcal" for Google Calendar MCP JSON, "msft" for Microsoft Graph Calendar API JSON.',
        },
        data: {
          type: 'string',
          description:
            'For source "ics": raw .ics calendar text. For source "ranges": JSON DateRange array (example: [{"id":"mtg1","label":"Team Sync","fromDate":"2026-03-30","toDate":"2026-03-30","startTime":"09:00","endTime":"10:00"}]). NOTE: use fromDate/toDate/startTime/endTime — NOT start/end. For source "gcal": JSON array from Google Calendar MCP gcal_list_events — events are auto-filtered (declined, transparent, working-location excluded) and converted to DateRange format. For source "msft": JSON array from Microsoft Graph Calendar API list events endpoint — events are auto-filtered (free, workingElsewhere, declined, cancelled, seriesMaster excluded) and Windows timezones are mapped to IANA. IMPORTANT: pass gcal/msft events through their native source — do NOT hand-convert them to "ranges" yourself. Flattening drops the transparency/declined filtering and the per-event timezone reconciliation this tool does for you (events stored in a different tz than their UTC offset will land at the wrong wall-clock time). If the upstream list_events payload is too large to bring into context, do NOT pass it through `data` at all — it has usually been saved to a file, so use load_calendar_file({path, source}) which reads it off disk. Only when the data is not on disk and must be inlined: slice it by date window at the source (e.g. jq on the saved result) and feed that native gcal/msft JSON — keep start/end/timeZone, eventType, transparency, and attendee responseStatus; only the heavy fields (description, htmlLink, conferenceData) are safe to strip.',
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
          description:
            'Optional parse window start date (YYYY-MM-DD). Must be paired with window_to.',
        },
        window_to: {
          type: 'string',
          description:
            'Optional parse window end date (YYYY-MM-DD). Must be paired with window_from.',
        },
      },
      required: ['source', 'data'],
    },
  },
  {
    name: 'load_calendar_file',
    description:
      'Load a calendar file from disk by path — `.ics` text, or Google Calendar / Microsoft Graph JSON (set `source`). Preferred over load_calendar whenever the data is already on disk (e.g. a list_events result too large to pass inline) — it reads the file directly instead of routing the contents through the conversation. gcal/msft JSON may be either a bare array of events or the raw result object with an `events` array.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the calendar file on disk.',
        },
        source: {
          type: 'string',
          enum: ['ics', 'gcal', 'msft'],
          description:
            'File format: "ics" (default) for .ics text, "gcal" for a Google Calendar list_events JSON file, "msft" for a Microsoft Graph events JSON file. gcal/msft are auto-filtered and converted exactly as in load_calendar.',
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
          description:
            'Optional parse window start date (YYYY-MM-DD). Must be paired with window_to.',
        },
        window_to: {
          type: 'string',
          description:
            'Optional parse window end date (YYYY-MM-DD). Must be paired with window_from.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'find_conflicts',
    description: 'Find timed conflicts across loaded calendars within a date window.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Start of the search window as an ISO date.',
        },
        to: {
          type: 'string',
          description: 'End of the search window as an ISO date.',
        },
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
        date: {
          type: 'string',
          description: 'Date to analyze, in YYYY-MM-DD format.',
        },
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
    name: 'find_shared_events',
    description:
      'Find events that appear in two or more loaded calendars, grouped by shared event UID.',
    inputSchema: {
      type: 'object',
      properties: {
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of calendar ids to compare. Defaults to all loaded calendars.',
        },
        from: {
          type: 'string',
          description: 'Optional ISO date filter for the start of the search window.',
        },
        to: {
          type: 'string',
          description: 'Optional ISO date filter for the end of the search window.',
        },
        limit: {
          type: 'number',
          description: 'Maximum shared events to return. Defaults to 50.',
        },
      },
    },
  },
  {
    name: 'find_common_availability',
    description: 'Find free time slots across specific calendars over a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which calendar ids to check. Must include at least two calendars.',
        },
        from: {
          type: 'string',
          description: 'Start of the search window as an ISO date.',
        },
        to: {
          type: 'string',
          description: 'End of the search window as an ISO date.',
        },
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
        limit: {
          type: 'number',
          description: 'Maximum slots to return. Defaults to 20.',
        },
      },
      required: ['calendars', 'from', 'to'],
    },
  },
  {
    name: 'find_next_free_slot',
    description: 'Find the next available free slot within a date window.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Search window start as an ISO date.',
        },
        to: {
          type: 'string',
          description: 'Search window end as an ISO date.',
        },
        duration: {
          type: 'number',
          description: 'Required duration in minutes.',
        },
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
    description:
      'Score a schedule window for conflicts, free time, focus blocks, and context switches.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Start of the scoring window as an ISO date.',
        },
        to: {
          type: 'string',
          description: 'End of the scoring window as an ISO date.',
        },
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
        date: {
          type: 'string',
          description: 'Date to inspect, in YYYY-MM-DD format.',
        },
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
        range_id: {
          type: 'string',
          description: 'The DateRange id to expand.',
        },
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
    name: 'list_ranges',
    description:
      'List the stored DateRanges across loaded calendars with summary metadata — ids, labels, date bounds, recurrence summaries. Use after load_calendar to see what a calendar contains without expanding occurrences or re-parsing source data. Recurring-event instances from gcal/msft are grouped into one row per series by default (group_by "series"). Each calendar reports its effective_window — for ics sources, ranges with explicit dates may be clipped to that window.',
    inputSchema: {
      type: 'object',
      properties: {
        calendars: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional list of calendar ids to include. Defaults to all loaded calendars.',
        },
        label_match: {
          type: 'string',
          description: 'Optional case-insensitive regular expression to filter rows by label.',
        },
        group_by: {
          type: 'string',
          enum: ['series', 'none'],
          description:
            'How to group gcal/msft recurring-event instances that share a series id. "series" (default) collapses them into one row with occurrence_count and a representative range_id; "none" returns one row per stored range.',
        },
        occurrence_unit: {
          type: 'string',
          enum: ['events', 'days'],
          description:
            'Unit for occurrence_count. "events" (default) counts individual occurrences — two instances or time slots on the same day count as 2. "days" counts distinct dates touched.',
        },
        count_within: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Window start as an ISO date (YYYY-MM-DD).' },
            to: { type: 'string', description: 'Window end as an ISO date (YYYY-MM-DD).' },
          },
          required: ['from', 'to'],
          description:
            'Optional bounded window (max 2 years). When provided, recurring rows get occurrence_count, first_occurrence, and last_occurrence computed within this window. Does not filter rows. Omit it for a cheap structural listing.',
        },
        limit: {
          type: 'number',
          description: 'Maximum rows to return. Defaults to 50.',
        },
      },
    },
  },
  {
    name: 'suggest_changes',
    description:
      'Preview schedule changes with before/after scoring and conflict counts without mutating session state.',
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
          description:
            'Optional scoring window start date. Defaults to earliest affected date minus 7 days.',
        },
        to: {
          type: 'string',
          description:
            'Optional scoring window end date. Defaults to latest affected date plus 7 days.',
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

interface AttendeeInfo {
  email: string;
  name?: string;
  role?: string;
  status?: string;
}

interface OrganizerInfo {
  email: string;
  name?: string;
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

  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`"${key}" must be an array of strings when provided.`);
  }

  return value;
}

function requireStringArray(args: Record<string, unknown>, key: string): string[] {
  const value = optionalStringArray(args, key);
  if (!value || value.length === 0) {
    throw new Error(`"${key}" must be a non-empty array of strings.`);
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

function formatWindow(window: { from: Date; to: Date }): {
  from: string;
  to: string;
} {
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

function collectUniqueLabels(
  ranges: DateRange[],
  limit: number,
): { labels: string[]; hasMore: boolean } {
  const labels = [...new Set(ranges.map((range) => range.label))];
  return {
    labels: labels.slice(0, limit),
    hasMore: labels.length > limit,
  };
}

function requireLoadedCalendars(session: CalendarSession, calendarIds: string[]): string[] {
  const uniqueIds = [...new Set(calendarIds)];

  if (uniqueIds.length === 0) {
    throw new Error('"calendars" must include at least one calendar id.');
  }

  const missing = uniqueIds.filter((calendarId) => !session.calendars.has(calendarId));
  if (missing.length > 0) {
    throw new Error(`Unknown calendar id${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  }

  return uniqueIds;
}

function getMetadataRecord(range: DateRange): Record<string, unknown> | undefined {
  if (!range.metadata || typeof range.metadata !== 'object' || Array.isArray(range.metadata)) {
    return undefined;
  }

  return range.metadata;
}

function readAttendees(value: unknown): AttendeeInfo[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attendees = value.flatMap((item): AttendeeInfo[] => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    if (typeof record.email !== 'string' || record.email.trim() === '') {
      return [];
    }

    return [
      {
        email: record.email,
        ...(typeof record.name === 'string' && record.name.trim() !== ''
          ? { name: record.name }
          : {}),
        ...(typeof record.role === 'string' && record.role.trim() !== ''
          ? { role: record.role }
          : {}),
        ...(typeof record.status === 'string' && record.status.trim() !== ''
          ? { status: record.status }
          : {}),
      },
    ];
  });

  return attendees.length > 0 ? attendees : undefined;
}

function readOrganizer(value: unknown): OrganizerInfo | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.email !== 'string' || record.email.trim() === '') {
    return undefined;
  }

  return {
    email: record.email,
    ...(typeof record.name === 'string' && record.name.trim() !== '' ? { name: record.name } : {}),
  };
}

function getRangeAttendees(range: DateRange): AttendeeInfo[] | undefined {
  return readAttendees(getMetadataRecord(range)?.attendees);
}

function getRangeOrganizer(range: DateRange): OrganizerInfo | undefined {
  return readOrganizer(getMetadataRecord(range)?.organizer);
}

function mergeAttendees(ranges: DateRange[]): AttendeeInfo[] | undefined {
  const attendeesByEmail = new Map<string, AttendeeInfo>();

  for (const range of ranges) {
    for (const attendee of getRangeAttendees(range) ?? []) {
      if (!attendeesByEmail.has(attendee.email)) {
        attendeesByEmail.set(attendee.email, attendee);
      }
    }
  }

  const attendees = [...attendeesByEmail.values()];
  return attendees.length > 0 ? attendees : undefined;
}

function getFirstOrganizer(ranges: DateRange[]): OrganizerInfo | undefined {
  for (const range of ranges) {
    const organizer = getRangeOrganizer(range);
    if (organizer) {
      return organizer;
    }
  }

  return undefined;
}

function buildRecurrenceSummary(range: DateRange): string | undefined {
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (range.everyWeekday?.length) {
    return `weekly on ${range.everyWeekday.map((day) => weekdayLabels[day] ?? String(day)).join(', ')}`;
  }

  if (range.everyDate?.length) {
    return `monthly on ${range.everyDate.join(', ')}`;
  }

  if (range.everyMonth?.length) {
    return `yearly in months ${range.everyMonth.join(', ')}`;
  }

  return undefined;
}

function rangeOverlapsDateFilter(range: DateRange, from?: string, to?: string): boolean {
  if (!from && !to) {
    return true;
  }

  const windowFrom = from ?? to!;
  const windowTo = to ?? from!;

  if (range.dates?.length) {
    return range.dates.some((date) => date >= windowFrom && date <= windowTo);
  }

  if (range.toDate && range.toDate < windowFrom) {
    return false;
  }

  if (range.fromDate && range.fromDate > windowTo) {
    return false;
  }

  return true;
}

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
  location?: string;
  status?: string;
  transparent?: boolean;
  has_attendees?: boolean;
  organizer_email?: string;
}

interface ListRangeEntry {
  row: ListRangeRow;
  ranges: DateRange[];
  isPattern: boolean;
}

const MAX_COUNT_WINDOW_DAYS = 731;
const MAX_LABEL_MATCH_LENGTH = 256;

type OccurrenceUnit = 'events' | 'days';

function hasRecurrencePattern(range: DateRange): boolean {
  return Boolean(
    range.everyWeekday?.length ||
    range.everyDate?.length ||
    range.everyMonth?.length ||
    range.everyHour?.length,
  );
}

function getSeriesId(range: DateRange): string | undefined {
  const metadata = getMetadataRecord(range);
  const seriesId = metadata?.recurringEventId ?? metadata?.seriesMasterId;
  return typeof seriesId === 'string' && seriesId !== '' ? seriesId : undefined;
}

function buildListRangeRow(calendarId: string, range: DateRange, isPattern: boolean): ListRangeRow {
  const window = getRangeDateWindow(range);
  const unbounded = isPattern && !range.toDate && !range.dates?.length;
  const recurrenceSummary = buildRecurrenceSummary(range);
  const metadata = getMetadataRecord(range);
  const attendees = getRangeAttendees(range);
  const organizer = getRangeOrganizer(range);

  return {
    calendar_id: calendarId,
    range_id: range.id,
    label: range.label,
    ...(window?.from ? { from_date: window.from } : {}),
    ...(unbounded ? { to_date: null, unbounded: true } : window?.to ? { to_date: window.to } : {}),
    ...(recurrenceSummary ? { recurrence_summary: recurrenceSummary } : {}),
    ...(range.startTime ? { start_time: range.startTime } : {}),
    ...(range.endTime ? { end_time: range.endTime } : {}),
    all_day: !range.startTime && !range.everyHour?.length,
    ...(range.timezone !== undefined ? { timezone: range.timezone } : {}),
    ...(range.dates?.length
      ? { occurrence_count: range.dates.length }
      : isPattern
        ? {}
        : { occurrence_count: 1 }),
    ...(typeof metadata?.location === 'string' ? { location: metadata.location } : {}),
    ...(typeof metadata?.status === 'string' ? { status: metadata.status } : {}),
    ...(metadata?.transparent === true ? { transparent: true } : {}),
    ...(attendees ? { has_attendees: true } : {}),
    ...(organizer ? { organizer_email: organizer.email } : {}),
  };
}

function countByUnit(occurrenceDates: string[], unit: OccurrenceUnit): number {
  return unit === 'days' ? new Set(occurrenceDates).size : occurrenceDates.length;
}

function buildSeriesGroupEntry(
  calendarId: string,
  seriesId: string,
  instances: DateRange[],
  unit: OccurrenceUnit,
): ListRangeEntry {
  const sorted = [...instances].sort((left, right) =>
    (getRangeDateWindow(left)?.from ?? '').localeCompare(getRangeDateWindow(right)?.from ?? ''),
  );
  const representative = sorted[0];
  const fromDates = sorted
    .map((range) => getRangeDateWindow(range)?.from)
    .filter((value): value is string => Boolean(value));
  const toDates = sorted
    .map((range) => getRangeDateWindow(range)?.to)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    row: {
      ...buildListRangeRow(calendarId, representative, hasRecurrencePattern(representative)),
      series_id: seriesId,
      ...(fromDates.length > 0 ? { from_date: fromDates[0] } : {}),
      ...(toDates.length > 0 ? { to_date: toDates[toDates.length - 1] } : {}),
      occurrence_count: unit === 'days' ? countByUnit(fromDates, 'days') : sorted.length,
    },
    ranges: sorted,
    isPattern: false,
  };
}

function buildListRangeEntries(
  session: CalendarSession,
  calendarIds: string[],
  options: { labelRegex?: RegExp; groupBy: 'series' | 'none'; unit: OccurrenceUnit },
): ListRangeEntry[] {
  const entries: ListRangeEntry[] = [];

  for (const calendarId of calendarIds) {
    // calendarIds are pre-validated, so the calendar always exists.
    const calendar = session.calendars.get(calendarId)!;

    const labelRegex = options.labelRegex;
    const matching = labelRegex
      ? calendar.ranges.filter((range) => labelRegex.test(range.label))
      : calendar.ranges;

    const seriesGroups = new Map<string, DateRange[]>();

    for (const range of matching) {
      const seriesId = options.groupBy === 'series' ? getSeriesId(range) : undefined;
      if (!seriesId) {
        const isPattern = hasRecurrencePattern(range);
        entries.push({
          row: buildListRangeRow(calendarId, range, isPattern),
          ranges: [range],
          isPattern,
        });
        continue;
      }

      const group = seriesGroups.get(seriesId);
      if (group) {
        group.push(range);
      } else {
        seriesGroups.set(seriesId, [range]);
      }
    }

    for (const [seriesId, instances] of seriesGroups) {
      entries.push(buildSeriesGroupEntry(calendarId, seriesId, instances, options.unit));
    }
  }

  return entries;
}

function annotateOccurrences(
  evaluator: RangeEvaluator,
  entry: ListRangeEntry,
  from: string,
  to: string,
  unit: OccurrenceUnit,
): ListRangeRow {
  const withOccurrenceDates = (occurrenceDates: string[]): ListRangeRow => ({
    ...entry.row,
    occurrence_count: countByUnit(occurrenceDates, unit),
    ...(occurrenceDates.length > 0
      ? {
          first_occurrence: occurrenceDates[0],
          last_occurrence: occurrenceDates[occurrenceDates.length - 1],
        }
      : {}),
  });

  if (entry.row.series_id) {
    const overlapping = entry.ranges.filter((range) => rangeOverlapsDateFilter(range, from, to));
    return withOccurrenceDates(
      overlapping
        .map((range) => getRangeDateWindow(range)?.from)
        .filter((value): value is string => Boolean(value))
        .sort(),
    );
  }

  const range = entry.ranges[0];

  if (range.dates?.length) {
    return withOccurrenceDates(range.dates.filter((date) => date >= from && date <= to).sort());
  }

  if (entry.isPattern) {
    const occurrences = evaluator.expand(range, parseDateArgument(from), parseDateArgument(to));
    return withOccurrenceDates(occurrences.map((occurrence) => occurrence.date).sort());
  }

  // Single non-recurring event: one occurrence if its span touches the window.
  const window = getRangeDateWindow(range);
  return withOccurrenceDates(
    window && rangeOverlapsDateFilter(range, from, to) ? [window.from] : [],
  );
}

function parseCountWithin(value: unknown): { from: string; to: string } | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requireRecord(value, 'count_within');
  const from = requireString(record, 'from');
  const to = requireString(record, 'to');
  const fromDate = parseDateArgument(from);
  const toDate = parseDateArgument(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error('"count_within" dates must be valid YYYY-MM-DD values.');
  }

  if (toDate < fromDate) {
    throw new Error('"count_within.to" must not be before "count_within.from".');
  }

  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (spanDays > MAX_COUNT_WINDOW_DAYS) {
    throw new Error(
      `"count_within" must span at most ${MAX_COUNT_WINDOW_DAYS} days. Use a narrower window.`,
    );
  }

  return { from, to };
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

function buildSharedEvents(
  session: CalendarSession,
  calendarIds: string[],
  from?: string,
  to?: string,
): Array<{
  id: string;
  label: string;
  startTime?: string;
  endTime?: string;
  recurrence_summary?: string;
  found_in_calendars: string[];
  attendees?: AttendeeInfo[];
  organizer?: OrganizerInfo;
}> {
  const sharedEvents: Array<{
    id: string;
    label: string;
    startTime?: string;
    endTime?: string;
    recurrence_summary?: string;
    found_in_calendars: string[];
    attendees?: AttendeeInfo[];
    organizer?: OrganizerInfo;
  }> = [];

  for (const [id, entries] of session.groupRangesByIdAcrossCalendars(calendarIds)) {
    const filteredEntries = entries.filter((entry) =>
      rangeOverlapsDateFilter(entry.range, from, to),
    );
    const distinctCalendars = [...new Set(filteredEntries.map((entry) => entry.calendarId))].sort();

    if (distinctCalendars.length < 2) {
      continue;
    }

    const representative = filteredEntries[0].range;
    const ranges = filteredEntries.map((entry) => entry.range);
    const attendees = mergeAttendees(ranges);
    const organizer = getFirstOrganizer(ranges);
    const recurrenceSummary = buildRecurrenceSummary(representative);

    sharedEvents.push({
      id,
      label: representative.label,
      ...(representative.startTime ? { startTime: representative.startTime } : {}),
      ...(representative.endTime ? { endTime: representative.endTime } : {}),
      ...(recurrenceSummary ? { recurrence_summary: recurrenceSummary } : {}),
      found_in_calendars: distinctCalendars,
      ...(attendees ? { attendees } : {}),
      ...(organizer ? { organizer } : {}),
    });
  }

  sharedEvents.sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );

  return sharedEvents;
}

function buildCommonAvailability(
  evaluator: RangeEvaluator,
  ranges: DateRange[],
  from: string,
  to: string,
  options: {
    minDuration: number;
    dayStart: string;
    dayEnd: string;
  },
): Array<{
  date: string;
  start: string;
  end: string;
  duration_minutes: number;
}> {
  return dateRange(from, to).flatMap((date) =>
    evaluator.findFreeSlots(ranges, date, options).map((slot) => ({
      date: slot.date,
      start: slot.startTime,
      end: slot.endTime,
      duration_minutes: slot.duration,
    })),
  );
}

function findRangeById(ranges: DateRange[], rangeId: string): DateRange | undefined {
  return ranges.find((range) => range.id === rangeId);
}

function applyDateUpdate(range: DateRange, date: string): DateRange {
  if (range.dates?.length) {
    if (range.dates.length !== 1) {
      throw new Error(
        `Range "${range.id}" cannot apply a single "date" update because it has multiple explicit dates.`,
      );
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

function applyChangesToRanges(
  ranges: DateRange[],
  changes: ProposedChange[],
): { ranges: DateRange[]; changesApplied: number } {
  let nextRanges = ranges.map(cloneRange);
  let changesApplied = 0;

  for (const change of changes) {
    switch (change.action) {
      case 'move': {
        if (!change.range_id) {
          throw new Error('Move changes require "range_id".');
        }

        const index = nextRanges.findIndex((range) => range.id === change.range_id);
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

        const filteredRanges = nextRanges.filter((range) => range.id !== change.range_id);
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

  const dates = [range.fromDate, range.toDate]
    .filter((value): value is string => Boolean(value))
    .sort();
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
      throw new Error(
        `${change.action === 'move' ? 'Move' : 'Remove'} changes require "range_id".`,
      );
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
    throw new Error(
      'Could not infer a scoring window from the proposed changes. Provide "from" and "to".',
    );
  }

  const earliest = windows.map((window) => window.from).sort()[0];
  const latest = windows.map((window) => window.to).sort()[windows.length - 1];

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

interface IcsLoadResult {
  ranges: DateRange[];
  effectiveWindow: { from: Date; to: Date };
  detectedWindow: { from: Date; to: Date } | null;
}

function loadIcsData(icsText: string, requestedWindow: { from: Date; to: Date }): IcsLoadResult {
  const detectedWindow = detectDataWindow(icsText);
  let ranges = parseICS(icsText, requestedWindow);
  let effectiveWindow = requestedWindow;

  // If we got very few results but the data lives elsewhere, re-parse
  // with the detected window. Unbounded recurrences (no UNTIL) match
  // any window, so a small result count doesn't mean the window is right.
  if (detectedWindow && ranges.length < 10) {
    const detectedRanges = parseICS(icsText, detectedWindow);
    if (detectedRanges.length > ranges.length) {
      ranges = detectedRanges;
      effectiveWindow = detectedWindow;
    }
  }

  return { ranges, effectiveWindow, detectedWindow };
}

// Accept either a bare event array or a provider result object that wraps one
// (e.g. a saved gcal/msft list_events response: `{ events: [...] }`).
function extractEventsArray(data: string, label: string): unknown[] {
  const parsed = JSON.parse(data) as unknown;
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { events?: unknown }).events)
  ) {
    return (parsed as { events: unknown[] }).events;
  }
  throw new Error(`${label} JSON must be an array of events, or an object with an "events" array.`);
}

function buildLoadResponse(
  session: CalendarSession,
  ranges: DateRange[],
  calendarId: string,
  source: 'ics' | 'ranges' | 'gcal' | 'msft',
  effectiveWindow: { from: Date; to: Date },
  detectedWindow: { from: Date; to: Date } | null,
): CallToolResult {
  // Only ics parsing clips data to a window; other sources load whole.
  const storedWindow = source === 'ics' ? formatWindow(effectiveWindow) : null;
  session.loadCalendar(calendarId, ranges, source, storedWindow);
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

        if (source !== 'ics' && source !== 'ranges' && source !== 'gcal' && source !== 'msft') {
          throw new Error('"source" must be "ics", "ranges", "gcal", or "msft".');
        }

        if ((windowFrom && !windowTo) || (!windowFrom && windowTo)) {
          throw new Error('"window_from" and "window_to" must be provided together.');
        }

        applyTimezone(session, timezone);

        const requestedWindow =
          windowFrom && windowTo
            ? {
                from: parseDateArgument(windowFrom),
                to: parseDateArgument(windowTo),
              }
            : getParseWindow();

        const calendarId = session.createCalendarId(id);

        if (source === 'ics') {
          const result = loadIcsData(data, requestedWindow);
          return buildLoadResponse(
            session,
            result.ranges,
            calendarId,
            'ics',
            result.effectiveWindow,
            result.detectedWindow,
          );
        }

        if (source === 'gcal') {
          const parsed = JSON.parse(data) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('Google Calendar JSON must decode to an array of events.');
          }

          const ranges = gcalEventsToDateRanges(parsed as GCalEvent[]);
          return buildLoadResponse(session, ranges, calendarId, 'gcal', requestedWindow, null);
        }

        if (source === 'msft') {
          const parsed = JSON.parse(data) as unknown;
          if (!Array.isArray(parsed)) {
            throw new Error('Microsoft Graph JSON must decode to an array of events.');
          }

          const ranges = msftEventsToDateRanges(parsed as MsftGraphEvent[]);
          return buildLoadResponse(session, ranges, calendarId, 'msft', requestedWindow, null);
        }

        const parsed = JSON.parse(data) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error('Range JSON must decode to an array.');
        }

        return buildLoadResponse(
          session,
          parsed as DateRange[],
          calendarId,
          'ranges',
          requestedWindow,
          null,
        );
      }

      case 'load_calendar_file': {
        const filePath = requireString(args, 'path');
        const source = optionalString(args, 'source') ?? 'ics';
        const id = optionalString(args, 'id');
        const timezone = optionalString(args, 'timezone');
        const windowFrom = optionalString(args, 'window_from');
        const windowTo = optionalString(args, 'window_to');

        if (source !== 'ics' && source !== 'gcal' && source !== 'msft') {
          throw new Error('"source" must be "ics", "gcal", or "msft".');
        }

        if ((windowFrom && !windowTo) || (!windowFrom && windowTo)) {
          throw new Error('"window_from" and "window_to" must be provided together.');
        }

        applyTimezone(session, timezone);

        const data = readFileSync(filePath, 'utf8');
        const requestedWindow =
          windowFrom && windowTo
            ? {
                from: parseDateArgument(windowFrom),
                to: parseDateArgument(windowTo),
              }
            : getParseWindow();

        const calendarId = session.createCalendarId(id);

        if (source === 'ics') {
          const result = loadIcsData(data, requestedWindow);
          return buildLoadResponse(
            session,
            result.ranges,
            calendarId,
            'ics',
            result.effectiveWindow,
            result.detectedWindow,
          );
        }

        // gcal/msft: the file is often a raw list_events result object
        // ({events: [...]}) rather than a bare array — accept either.
        const events = extractEventsArray(
          data,
          source === 'gcal' ? 'Google Calendar' : 'Microsoft Graph',
        );
        const ranges =
          source === 'gcal'
            ? gcalEventsToDateRanges(events as GCalEvent[])
            : msftEventsToDateRanges(events as MsftGraphEvent[]);
        return buildLoadResponse(session, ranges, calendarId, source, requestedWindow, null);
      }

      case 'find_conflicts': {
        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const ranges = getRanges(session, args);
        const limit = optionalLimit(args);
        const conflicts = session.evaluator.findConflictsInWindow(
          ranges,
          parseDateArgument(from),
          parseDateArgument(to),
        );

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

        return jsonResult(truncateArray(freeSlots, 'free_slots', limit));
      }

      case 'find_shared_events': {
        const requestedCalendars = optionalStringArray(args, 'calendars');
        const calendarsCompared = requestedCalendars
          ? requireLoadedCalendars(session, requestedCalendars)
          : [...session.calendars.keys()];
        const from = optionalString(args, 'from');
        const to = optionalString(args, 'to');
        const limit = optionalLimit(args);
        const sharedEvents = buildSharedEvents(session, calendarsCompared, from, to);

        return jsonResult({
          ...truncateArray(sharedEvents, 'shared_events', limit),
          calendars_compared: calendarsCompared,
        });
      }

      case 'find_common_availability': {
        const calendars = requireLoadedCalendars(session, requireStringArray(args, 'calendars'));
        if (calendars.length < 2) {
          throw new Error('"calendars" must include at least two calendar ids.');
        }

        const from = requireString(args, 'from');
        const to = requireString(args, 'to');
        const limit = optionalLimit(args, 20);
        const ranges = session.getAllRanges(calendars);
        const commonSlots = buildCommonAvailability(session.evaluator, ranges, from, to, {
          minDuration: optionalNumber(args, 'min_duration', 30),
          dayStart: optionalString(args, 'day_start') ?? '09:00',
          dayEnd: optionalString(args, 'day_end') ?? '17:00',
        });

        return jsonResult({
          ...truncateArray(commonSlots, 'common_slots', limit),
          calendars_checked: calendars,
          search_window: { from, to },
        });
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
          session.evaluator.findNextFreeSlot(
            ranges,
            parseDateArgument(from),
            parseDateArgument(to),
            duration,
            {
              dayStart: optionalString(args, 'day_start'),
              dayEnd: optionalString(args, 'day_end'),
            },
          ),
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
        const range = session.getAllRanges().find((candidate) => candidate.id === rangeId);

        if (!range) {
          throw new Error(`Range "${rangeId}" was not found in the current session.`);
        }

        const occurrences = session.evaluator.expand(
          range,
          parseDateArgument(from),
          parseDateArgument(to),
        );
        return jsonResult(truncateArray(occurrences, 'occurrences', limit));
      }

      case 'list_calendars': {
        return jsonResult(session.getCalendarSummary());
      }

      case 'list_ranges': {
        const requestedCalendars = optionalStringArray(args, 'calendars');
        const calendarIds = requestedCalendars
          ? requireLoadedCalendars(session, requestedCalendars)
          : [...session.calendars.keys()];
        const labelMatch = optionalString(args, 'label_match');
        const groupBy = optionalString(args, 'group_by') ?? 'series';
        const occurrenceUnit = optionalString(args, 'occurrence_unit') ?? 'events';
        const countWithin = parseCountWithin(args.count_within);
        const limit = optionalLimit(args);

        if (groupBy !== 'series' && groupBy !== 'none') {
          throw new Error('"group_by" must be "series" or "none".');
        }

        if (occurrenceUnit !== 'events' && occurrenceUnit !== 'days') {
          throw new Error('"occurrence_unit" must be "events" or "days".');
        }

        let labelRegex: RegExp | undefined;
        if (labelMatch !== undefined) {
          if (labelMatch.length > MAX_LABEL_MATCH_LENGTH) {
            throw new Error(`"label_match" must be at most ${MAX_LABEL_MATCH_LENGTH} characters.`);
          }

          try {
            labelRegex = new RegExp(labelMatch, 'i');
          } catch {
            throw new Error(`"label_match" is not a valid regular expression: ${labelMatch}`);
          }
        }

        const entries = buildListRangeEntries(session, calendarIds, {
          labelRegex,
          groupBy,
          unit: occurrenceUnit,
        });

        entries.sort(
          (left, right) =>
            (left.row.from_date ?? '9999-12-31').localeCompare(
              right.row.from_date ?? '9999-12-31',
            ) ||
            left.row.label.localeCompare(right.row.label) ||
            left.row.range_id.localeCompare(right.row.range_id),
        );

        // Annotate only the returned page — sort order doesn't depend on it.
        const rows = entries
          .slice(0, limit)
          .map((entry) =>
            countWithin
              ? annotateOccurrences(
                  session.evaluator,
                  entry,
                  countWithin.from,
                  countWithin.to,
                  occurrenceUnit,
                )
              : entry.row,
          );

        return jsonResult({
          ranges: rows,
          total: entries.length,
          ...(entries.length > limit
            ? {
                truncated: true,
                message: `Showing ${limit} of ${entries.length}. Use label_match, calendars, or a higher limit.`,
              }
            : {}),
          timezone: session.timezone,
          calendars: calendarIds.map((calendarId) => ({
            id: calendarId,
            effective_window: session.calendars.get(calendarId)?.effectiveWindow ?? null,
          })),
          ...(countWithin ? { count_within: countWithin } : {}),
        });
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
    { name: 'daywatch-mcp', version: VERSION },
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

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(session, request.params.name, request.params.arguments),
  );

  return server;
}
