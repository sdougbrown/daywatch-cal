// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { For, createMemo } from 'solid-js';
import { createFreeSlots, createTimeline, createTimeSelection } from '@daywatch/cal-solid';
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

export function TimePicker(props: TimePickerProps) {
  const startHour = () => props.startHour ?? 8;
  const endHour = () => props.endHour ?? 18;
  const intervalMinutes = () => props.intervalMinutes ?? 30;
  const minDuration = () => props.minDuration ?? 30;
  const dayStart = createMemo(() => hourToTime(startHour()));
  const dayEnd = createMemo(() => hourToTime(endHour()));
  const showAvailability = createMemo(() => Boolean(props.availabilityRanges?.length));

  // Timeline data stays separate from interaction state: slots come from createTimeline.
  const timeline = createTimeline(() => ({
    date: props.date,
    events: props.events,
    startHour: startHour(),
    endHour: endHour(),
    intervalMinutes: intervalMinutes(),
  }));

  const freeSlots = createFreeSlots(() => ({
    ranges: props.availabilityRanges ?? [],
    date: props.date,
    minDuration: minDuration(),
    dayStart: dayStart(),
    dayEnd: dayEnd(),
    userTimezone: props.userTimezone,
  }));

  // createTimeSelection adds click/hover selection behavior over the slot list.
  const timeSelection = createTimeSelection(() => ({
    selection: props.selection,
    onSelectionChange: props.onSelectionChange,
    date: props.date,
    intervalMinutes: intervalMinutes(),
    minDuration: minDuration(),
    dayStart: dayStart(),
    dayEnd: dayEnd(),
  }));

  const rangeEnd = createMemo(
    () => timeSelection.selection().endTime ?? timeSelection.selection().preview,
  );
  const fallbackBoundary = createMemo(() => hourToTime(endHour()));

  return (
    <div class='neo-timepicker'>
      <For each={timeline.slots()}>
        {(slot, index) => {
          const nextBoundary = () => timeline.slots()[index() + 1]?.time ?? fallbackBoundary();
          const selected = () =>
            slot.time === timeSelection.selection().startTime ||
            nextBoundary() === timeSelection.selection().endTime;
          const preview = () =>
            !timeSelection.selection().endTime && slot.time === timeSelection.selection().preview;
          const inRange = () =>
            Boolean(
              timeSelection.selection().startTime &&
              rangeEnd() &&
              isTimeBetween(
                slot.time,
                timeSelection.selection().startTime as string,
                rangeEnd() as string,
              ),
            );
          const occupied = () => slot.events.length > 0;
          const free = () => showAvailability() && isTimeInFreeSlots(slot.time, freeSlots());

          return (
            <button
              type='button'
              class='neo-timepicker__slot'
              data-free={free() ? '' : undefined}
              data-in-range={inRange() ? '' : undefined}
              data-occupied={occupied() ? '' : undefined}
              data-preview={preview() ? '' : undefined}
              data-selected={selected() ? '' : undefined}
              onClick={() => timeSelection.onTimeClick(slot.time)}
              onFocus={() => timeSelection.onTimeHover(slot.time)}
              onMouseEnter={() => timeSelection.onTimeHover(slot.time)}
            >
              <span class='neo-timepicker__label'>{slot.time}</span>
              <span class='neo-timepicker__events'>
                {occupied() ? slot.events.map(({ event }) => event.title).join(', ') : 'Available'}
              </span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
