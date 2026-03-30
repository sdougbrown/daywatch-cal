// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { selectionToDateRange } from '@neo-reckoning/models';
import { useCalendarEvents } from '@neo-reckoning/preact';
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

export function RangePicker({
  onRangeCreated,
  ranges,
  intervalMinutes = 30,
  startHour = 8,
  endHour = 18,
  minDuration = 30,
  userTimezone,
}: RangePickerProps) {
  const today = getTodayDateString();
  const [dateSelection, setDateSelection] = useState<DateSelection>(emptyDateSelection);
  const [timeSelection, setTimeSelection] = useState<TimeSelection>(() => emptyTimeSelection(today));
  const activeDate = dateSelection.start ?? today;
  const dateSelectionComplete = Boolean(dateSelection.start && dateSelection.end);

  // Once the date span changes, reset the time step so the two phases stay in sync.
  useEffect(() => {
    setTimeSelection(emptyTimeSelection(activeDate));
  }, [activeDate, dateSelection.end]);

  const events = useCalendarEvents({
    ranges,
    importedEvents: [],
    from: startOfDay(activeDate),
    to: endOfDay(activeDate),
    userTimezone,
  });

  // The final DateRange is assembled by combining the completed date selection
  // with the time block as template fields.
  useEffect(() => {
    if (!dateSelection.start || !dateSelection.end) {
      return;
    }

    if (!timeSelection.startTime || !timeSelection.endTime) {
      return;
    }

    const range = selectionToDateRange(dateSelection, {
      label: 'New range',
      startTime: timeSelection.startTime,
      endTime: timeSelection.endTime,
    });

    if (!range) {
      return;
    }

    onRangeCreated(range);
    setDateSelection(emptyDateSelection());
    setTimeSelection(emptyTimeSelection(today));
  }, [dateSelection, onRangeCreated, timeSelection, today]);

  const helperText = useMemo(() => {
    if (!dateSelectionComplete) {
      return 'Select a date range to unlock time selection.';
    }

    return `Choose a time block for ${activeDate}.`;
  }, [activeDate, dateSelectionComplete]);

  return (
    <div
      className="neo-range-picker"
      style={{
        display: 'grid',
        gap: '1rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      <div className="neo-range-picker__column">
        <h3>Date range</h3>
        <DatePicker
          blockedRanges={ranges}
          onSelectionChange={setDateSelection}
          ranges={ranges}
          selection={dateSelection}
          userTimezone={userTimezone}
        />
      </div>

      <div className="neo-range-picker__column">
        <h3>Time block</h3>
        <p>{helperText}</p>

        {dateSelectionComplete ? (
          <TimePicker
            availabilityRanges={ranges}
            date={activeDate}
            endHour={endHour}
            events={events}
            intervalMinutes={intervalMinutes}
            minDuration={minDuration}
            onSelectionChange={setTimeSelection}
            selection={timeSelection}
            startHour={startHour}
            userTimezone={userTimezone}
          />
        ) : null}
      </div>
    </div>
  );
}
