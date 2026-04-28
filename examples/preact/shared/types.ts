import type { CalendarEvent, DateRange, FreeSlot, Month, TimelineSlot } from '@daywatch/cal';
import type { DateSelection, TimeSelection } from '@daywatch/cal-models';

export type {
  CalendarEvent,
  DateRange,
  DateSelection,
  FreeSlot,
  Month,
  TimeSelection,
  TimelineSlot,
};

export type RangeCreatedHandler = (range: DateRange) => void;
