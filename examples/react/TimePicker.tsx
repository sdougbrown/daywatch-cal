// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { useMemo } from 'react';
import { useFreeSlots, useTimeline, useTimeSelection } from '@daywatch/cal-react';
import type { CalendarEvent, DateRange, TimeSelection } from './shared/types.js';

export interface TimePickerProps {
  selection: TimeSelection;
  onSelectionChange: (selection: TimeSelection) => void;
  date: string;
  events: CalendarEvent[];
  availabilityRanges?: DateRange[];
  intervalMinutes?: number;
  startHour?: number;
  endHour?: number;
  minDuration?: number;
  userTimezone?: string;
}

function hourToTime(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function isTimeBetween(time: string, start: string, end: string): boolean {
  const from = start < end ? start : end;
  const to = start < end ? end : start;
  return time > from && time < to;
}

function isTimeInFreeSlots(
  time: string,
  freeSlots: { startTime: string; endTime: string }[],
): boolean {
  return freeSlots.some((slot) => time >= slot.startTime && time < slot.endTime);
}

export function TimePicker({
  selection,
  onSelectionChange,
  date,
  events,
  availabilityRanges,
  intervalMinutes = 30,
  startHour = 8,
  endHour = 18,
  minDuration = 30,
  userTimezone,
}: TimePickerProps) {
  const dayStart = hourToTime(startHour);
  const dayEnd = hourToTime(endHour);
  const showAvailability = Boolean(availabilityRanges?.length);

  // Timeline data stays separate from interaction state: slots come from useTimeline.
  const { slots } = useTimeline({
    date,
    events,
    startHour,
    endHour,
    intervalMinutes,
  });

  const freeSlots = useFreeSlots({
    ranges: availabilityRanges ?? [],
    date,
    minDuration,
    dayStart,
    dayEnd,
    userTimezone,
  });

  // useTimeSelection adds click/hover selection behavior over the slot list.
  const {
    selection: currentSelection,
    onTimeClick,
    onTimeHover,
  } = useTimeSelection({
    selection,
    onSelectionChange,
    date,
    intervalMinutes,
    minDuration,
    dayStart,
    dayEnd,
  });

  const rangeEnd = currentSelection.endTime ?? currentSelection.preview;
  const fallbackBoundary = useMemo(() => hourToTime(endHour), [endHour]);

  return (
    <div className='neo-timepicker'>
      {slots.map((slot, index) => {
        const nextBoundary = slots[index + 1]?.time ?? fallbackBoundary;
        const selected =
          slot.time === currentSelection.startTime || nextBoundary === currentSelection.endTime;
        const preview = !currentSelection.endTime && slot.time === currentSelection.preview;
        const inRange =
          currentSelection.startTime && rangeEnd
            ? isTimeBetween(slot.time, currentSelection.startTime, rangeEnd)
            : false;
        const occupied = slot.events.length > 0;
        const free = showAvailability && isTimeInFreeSlots(slot.time, freeSlots);

        return (
          <button
            key={slot.time}
            type='button'
            className='neo-timepicker__slot'
            data-free={free ? '' : undefined}
            data-in-range={inRange ? '' : undefined}
            data-occupied={occupied ? '' : undefined}
            data-preview={preview ? '' : undefined}
            data-selected={selected ? '' : undefined}
            onClick={() => onTimeClick(slot.time)}
            onFocus={() => onTimeHover(slot.time)}
            onMouseEnter={() => onTimeHover(slot.time)}
          >
            <span className='neo-timepicker__label'>{slot.time}</span>
            <span className='neo-timepicker__events'>
              {occupied ? slot.events.map(({ event }) => event.title).join(', ') : 'Available'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
