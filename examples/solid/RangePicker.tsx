// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { selectionToDateRange } from '@neo-reckoning/models';
import { createCalendarEvents } from '@neo-reckoning/solid';
import { DatePicker } from './DatePicker.js';
import { TimePicker } from './TimePicker.js';
import type {
  DateRange,
  DateSelection,
  RangeCreatedHandler,
  TimeSelection,
} from './shared/types.js';

export interface RangePickerProps {
  onRangeCreated: RangeCreatedHandler;
  ranges: DateRange[];
  intervalMinutes?: number;
  startHour?: number;
  endHour?: number;
  minDuration?: number;
  userTimezone?: string;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59`);
}

function emptyDateSelection(): DateSelection {
  return {
    start: null,
    end: null,
    preview: null,
  };
}

function emptyTimeSelection(date: string): TimeSelection {
  return {
    date,
    startTime: null,
    endTime: null,
    preview: null,
  };
}

export function RangePicker(props: RangePickerProps) {
  const today = getTodayDateString();
  const [dateSelection, setDateSelection] = createSignal<DateSelection>(emptyDateSelection());
  const activeDate = createMemo(() => dateSelection().start ?? today);
  const [timeSelection, setTimeSelection] = createSignal<TimeSelection>(
    emptyTimeSelection(activeDate()),
  );
  const dateSelectionComplete = createMemo(() => Boolean(dateSelection().start && dateSelection().end));

  // Once the date span changes, reset the time step so the two phases stay in sync.
  createEffect(() => {
    dateSelection().start;
    dateSelection().end;
    setTimeSelection(emptyTimeSelection(activeDate()));
  });

  const events = createCalendarEvents(() => ({
    ranges: props.ranges,
    importedEvents: [],
    from: startOfDay(activeDate()),
    to: endOfDay(activeDate()),
    userTimezone: props.userTimezone,
  }));

  // The final DateRange is assembled by combining the completed date selection
  // with the time block as template fields.
  createEffect(() => {
    const dates = dateSelection();
    const times = timeSelection();

    if (!dates.start || !dates.end) {
      return;
    }

    if (!times.startTime || !times.endTime) {
      return;
    }

    const range = selectionToDateRange(dates, {
      label: 'New range',
      startTime: times.startTime,
      endTime: times.endTime,
    });

    if (!range) {
      return;
    }

    props.onRangeCreated(range);
    setDateSelection(emptyDateSelection());
    setTimeSelection(emptyTimeSelection(today));
  });

  const helperText = createMemo(() => {
    if (!dateSelectionComplete()) {
      return 'Select a date range to unlock time selection.';
    }

    return `Choose a time block for ${activeDate()}.`;
  });

  return (
    <div
      class="neo-range-picker"
      style={{
        display: 'grid',
        gap: '1rem',
        'grid-template-columns': 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      <div class="neo-range-picker__column">
        <h3>Date range</h3>
        <DatePicker
          blockedRanges={props.ranges}
          onSelectionChange={setDateSelection}
          ranges={props.ranges}
          selection={dateSelection()}
          userTimezone={props.userTimezone}
        />
      </div>

      <div class="neo-range-picker__column">
        <h3>Time block</h3>
        <p>{helperText()}</p>

        <Show when={dateSelectionComplete()}>
          <TimePicker
            availabilityRanges={props.ranges}
            date={activeDate()}
            endHour={props.endHour}
            events={events()}
            intervalMinutes={props.intervalMinutes}
            minDuration={props.minDuration}
            onSelectionChange={setTimeSelection}
            selection={timeSelection()}
            startHour={props.startHour}
            userTimezone={props.userTimezone}
          />
        </Show>
      </div>
    </div>
  );
}
