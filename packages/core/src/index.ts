// Types
export type {
  DateRange,
  Occurrence,
  TimeSlot,
  DayRangeInfo,
  SpanInfo,
  Day,
  Week,
  Month,
  CalendarEvent,
  PositionedEvent,
  TimelineSlot,
  CalendarGridConfig,
  TimelineGridConfig,
  CacheAdapter,
  ViewFidelity,
  DisplayType,
  YearGridConfig,
  YearMonth,
  YearDay,
} from './types.js';

// Core classes
export { RangeEvaluator } from './evaluator.js';
export { CalendarGrid } from './grid.js';
export { TimelineGrid, computeEventPositions } from './timeline.js';
export { YearGrid } from './yearGrid.js';

// Display type resolution
export { resolveDisplayType } from './displayType.js';

// Event normalization
export { fromDateRange, expandToEvents } from './events.js';

// Time utilities (exposed for consumers that need them)
export {
  parseTime,
  formatTime,
  timeToMinutes,
  minutesToTime,
  parseDate,
  formatDate,
  getDayOfWeek,
  daysInMonth,
  dateRange,
  getToday,
  convertTime,
  buildDate,
} from './time.js';
