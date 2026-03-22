/**
 * View fidelity level — controls how much detail CalendarGrid computes per day.
 * - 'year': only hasActivity boolean (skip ranges[], timeSlots[])
 * - 'month': ranges[] populated (skip timeSlots[])
 * - 'week' / 'day': both ranges[] and timeSlots[] populated
 */
export type ViewFidelity = 'year' | 'month' | 'week' | 'day';

/**
 * Display type hint — passed through from the API for the SPA to interpret.
 */
export type DisplayType = 'auto' | 'span' | 'dot' | 'fill' | 'chip' | 'block';

/**
 * A DateRange defines a set of dates and/or times using either explicit values
 * or recurrence patterns. This is the core data model of neo-reckoning,
 * carried forward from the original Reckoning library and extended with
 * sub-day time support.
 */
export interface DateRange {
  id: string;
  label: string;
  title?: string;

  // === Day-level (from Reckoning) ===
  /** Explicit date list, e.g. ["2026-03-21", "2026-03-25"] */
  dates?: string[];
  /** Range start date (YYYY-MM-DD) */
  fromDate?: string;
  /** Range end date (YYYY-MM-DD) */
  toDate?: string;
  /** If true, recurrence is constrained to the fromDate/toDate window */
  fixedBetween?: boolean;

  // Day recurrence
  /** Days of month this range recurs on, e.g. [1, 15] */
  everyDate?: number[];
  /** Days of week (0=Sunday, 6=Saturday), e.g. [1, 3, 5] for Mon/Wed/Fri */
  everyWeekday?: number[];
  /** Months (1-12), e.g. [6, 12] for June and December */
  everyMonth?: number[];

  // === Sub-day — two mutually exclusive approaches ===

  // Approach A: explicit hours
  /** Specific hours (0-23), e.g. [6, 14, 22]. Mutually exclusive with startTime/repeatEvery. */
  everyHour?: number[];

  // Approach B: interval from start
  /** Start time in HH:mm format. Mutually exclusive with everyHour. */
  startTime?: string;
  /** End time in HH:mm format. Requires startTime. */
  endTime?: string;
  /** Repeat interval in minutes from startTime. Requires startTime. */
  repeatEvery?: number;
  /** Duration in minutes per occurrence. */
  duration?: number;

  // Timezone
  /**
   * IANA timezone identifier.
   * - "UTC": times are in UTC, will be converted to userTimezone for display (default for API ranges)
   * - Other IANA tz: times are in that timezone, converted to userTimezone
   * - null/undefined: floating time — no conversion, times are as-is
   */
  timezone?: string | null;

  /** Display hint from the API. Neo-reckoning passes this through, SPA interprets it. */
  displayType?: DisplayType;
}

/**
 * A concrete occurrence of a DateRange — one specific date/time that the range
 * evaluates to within a given window.
 */
export interface Occurrence {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Start time in HH:mm format, null for all-day */
  startTime: string | null;
  /** End time in HH:mm format, null for all-day or when no end is defined */
  endTime: string | null;
  /** ID of the source DateRange */
  rangeId: string;
  /** Label from the source DateRange */
  label: string;
  /** Whether this is an all-day occurrence (no time fields) */
  allDay: boolean;
  /** Display type hint passed through from the source DateRange */
  displayType?: string;
}

/**
 * A time slot within a single day — used for day/week detail views.
 */
export interface TimeSlot {
  /** Start time in HH:mm format */
  startTime: string;
  /** End time in HH:mm format, null if open-ended */
  endTime: string | null;
  /** Duration in minutes, null if not computable */
  duration: number | null;
  /** ID of the source DateRange */
  rangeId: string;
  /** Label from the source DateRange */
  label: string;
}

/**
 * Information about a DateRange's presence on a specific day — used for
 * month-grid rendering to show contiguous spans.
 */
export interface DayRangeInfo {
  /** ID of the source DateRange */
  rangeId: string;
  /** Label from the source DateRange */
  label: string;
  /** True if this is the first day of a contiguous span */
  isStart: boolean;
  /** True if this is the last day of a contiguous span */
  isEnd: boolean;
  /** True if this day is in the middle of a contiguous span */
  isContinuation: boolean;
  /** Display type hint passed through from the source DateRange */
  displayType?: string;
}

/**
 * Information about a contiguous span of days for a DateRange within a window.
 * Used for overlap detection and lane-based rendering in month/timeline views.
 */
export interface SpanInfo {
  /** ID of the source DateRange */
  rangeId: string;
  /** Label from the source DateRange */
  label: string;
  /** Display type hint passed through from the DateRange */
  displayType?: string;
  /** First day of this contiguous span (YYYY-MM-DD) */
  startDate: string;
  /** Last day of this contiguous span (YYYY-MM-DD) */
  endDate: string;
  /** Total days in this span */
  length: number;
  /** Maximum number of overlapping ranges at any point in this span */
  maxOverlap: number;
  /** Consistent lane assignment for rendering (0-based) */
  lane: number;
  /** Total number of lanes needed across all spans sharing any overlap day with this span */
  totalLanes: number;
}

/**
 * A single day in a calendar grid.
 */
export interface Day {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Day of month (1-31) */
  dayOfMonth: number;
  /** Whether this day belongs to the month being displayed */
  isCurrentMonth: boolean;
  /** Whether this is today */
  isToday: boolean;
  /** Which ranges this day belongs to */
  ranges: DayRangeInfo[];
  /** Sub-day occurrences, populated for day/week views */
  timeSlots: TimeSlot[];
  /** True if any range matches this day. Only computed for 'year' fidelity to save work. */
  hasActivity?: boolean;
}

/**
 * A week in a calendar grid — always 7 days.
 */
export interface Week {
  days: Day[];
}

/**
 * A month in a calendar grid.
 */
export interface Month {
  year: number;
  /** Month number (0-11, matching JS Date convention) */
  month: number;
  /** Formatted label, e.g. "March 2026" */
  label: string;
  weeks: Week[];
}

/**
 * Normalized event model — the single shape consumed by the rendering layer.
 * Both native DateRanges and imported .ics events converge into this.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  source: 'native' | 'imported';
  /** Range ID (native) or subscription ID (imported) — SPA maps this to colors */
  sourceId: string;
  editable: boolean;
  /** Source-specific extras (location, description, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * A positioned event in a timeline view — includes layout data for rendering.
 */
export interface PositionedEvent {
  event: CalendarEvent;
  /** Percentage offset from the timeline start (0-100) */
  top: number;
  /** Percentage height based on duration (0-100) */
  height: number;
  /** Column index for side-by-side overlapping events (0-based) */
  column: number;
  /** Total number of columns at this overlap point */
  totalColumns: number;
}

/**
 * A slot in a timeline view.
 */
export interface TimelineSlot {
  /** Time label, e.g. "06:00" */
  time: string;
  hour: number;
  minute: number;
  /** Events that overlap this slot */
  events: PositionedEvent[];
}

/**
 * Configuration for CalendarGrid.
 */
export interface CalendarGridConfig {
  /** Center the grid on this date (YYYY-MM-DD) */
  focusDate: string;
  /** How many months to generate */
  numberOfMonths: number;
  /** DateRanges to evaluate against the grid */
  ranges: DateRange[];
  /** Week start day: 0=Sunday, 1=Monday. Default: 0 */
  weekStartsOn?: number;
  /** BCP 47 locale tag for Intl formatting. Default: browser/runtime default */
  locale?: string;
  /** IANA timezone for the user viewing the calendar */
  userTimezone?: string;
  /** View fidelity level — controls how much detail is computed per day. Default: 'month' */
  fidelity?: ViewFidelity;
}

/**
 * Configuration for TimelineGrid.
 */
export interface TimelineGridConfig {
  /** Which day to render (YYYY-MM-DD) */
  date: string;
  /** Start hour of the timeline (0-23). Default: 0 */
  startHour?: number;
  /** End hour of the timeline (1-24). Default: 24 */
  endHour?: number;
  /** Slot granularity in minutes: 15, 30, or 60. Default: 60 */
  intervalMinutes?: number;
  /** Normalized events for this day */
  events: CalendarEvent[];
}

/**
 * Pluggable cache adapter for @neo-reckoning/ical.
 * Supports both sync (web localStorage) and async (React Native AsyncStorage) implementations.
 */
export interface CacheAdapter {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
  remove(key: string): Promise<void> | void;
}

// === Year Grid types ===

/**
 * Configuration for YearGrid.
 */
export interface YearGridConfig {
  /** The year to generate (e.g. 2026) */
  year: number;
  /** DateRanges to evaluate against the grid */
  ranges: DateRange[];
  /** IANA timezone for the user viewing the calendar */
  userTimezone?: string;
}

/**
 * A month within a year grid — lightweight, no weeks/time slots.
 */
export interface YearMonth {
  /** Month number (0-11) */
  month: number;
  /** Month label, e.g. "January" */
  label: string;
  /** Count of days that have at least one range match */
  activeDays: number;
  /** Total days in the month */
  totalDays: number;
  /** Per-day activity data for heatmap-style rendering */
  days: YearDay[];
}

/**
 * A single day in a year grid.
 */
export interface YearDay {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Day of month (1-31) */
  dayOfMonth: number;
  /** How many ranges match this day */
  rangeCount: number;
  /** IDs of matching ranges (SPA maps these to colors) */
  rangeIds: string[];
}
