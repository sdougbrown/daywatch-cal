import type {
  CalendarEvent,
  DateRange,
  FreeSlot,
  Month,
  TimelineSlot,
} from '@neo-reckoning/core';
import type { DateSelection, TimeSelection } from '@neo-reckoning/models';

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
