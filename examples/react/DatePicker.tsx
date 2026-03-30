// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { useEffect, useMemo, useState } from 'react';
import { createIsDateBlocked } from '@neo-reckoning/models';
import { useCalendar, useDateSelection } from '@neo-reckoning/react';
import type { DateRange, DateSelection } from './shared/types.js';

export interface DatePickerProps {
  selection: DateSelection;
  onSelectionChange: (selection: DateSelection) => void;
  ranges: DateRange[];
  blockedRanges?: DateRange[];
  numberOfMonths?: number;
  weekStartsOn?: number;
  locale?: string;
  userTimezone?: string;
}

function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekdayLabels(weekStartsOn: number, locale?: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });

  return Array.from({ length: 7 }, (_, index) => {
    const weekday = (weekStartsOn + index) % 7;
    return formatter.format(new Date(Date.UTC(2026, 2, 29 + weekday)));
  });
}

function isDateBetween(date: string, start: string, end: string): boolean {
  const from = start < end ? start : end;
  const to = start < end ? end : start;
  return date > from && date < to;
}

export function DatePicker({
  selection,
  onSelectionChange,
  ranges,
  blockedRanges = [],
  numberOfMonths = 1,
  weekStartsOn = 0,
  locale,
  userTimezone,
}: DatePickerProps) {
  const today = getTodayDateString();
  const [focusDate, setFocusDate] = useState(selection.start ?? today);

  useEffect(() => {
    if (selection.start) {
      setFocusDate(selection.start);
    }
  }, [selection.start]);

  const weekdayLabels = useMemo(
    () => getWeekdayLabels(weekStartsOn, locale),
    [locale, weekStartsOn],
  );

  const isDateBlocked = useMemo(() => {
    if (blockedRanges.length === 0) {
      return () => false;
    }

    return createIsDateBlocked(blockedRanges, { userTimezone });
  }, [blockedRanges, userTimezone]);

  // useCalendar owns the month-grid math while this component supplies the markup.
  const { months, next, prev, goTo } = useCalendar({
    focusDate,
    onFocusDateChange: setFocusDate,
    numberOfMonths,
    ranges,
    fidelity: 'month',
    weekStartsOn,
    locale,
    userTimezone,
  });

  // useDateSelection layers controlled click/hover selection on top of the grid.
  const { onDateClick, onDateHover } = useDateSelection({
    selection,
    onSelectionChange,
    isDateSelectable: date => !isDateBlocked(date),
  });

  const rangeEnd = selection.end ?? selection.preview;

  return (
    <div className="neo-datepicker">
      <div className="neo-datepicker__nav">
        <button type="button" onClick={prev}>
          Previous
        </button>
        <strong>{months[0]?.label}</strong>
        <button type="button" onClick={next}>
          Next
        </button>
      </div>

      {months.map(month => (
        <div
          key={`${month.year}-${month.month}`}
          className="neo-datepicker__month"
        >
          {numberOfMonths > 1 ? <h3>{month.label}</h3> : null}

          <table className="neo-datepicker__grid">
            <thead>
              <tr>
                {weekdayLabels.map(label => (
                  <th key={label} className="neo-datepicker__weekday" scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {month.weeks.map((week, weekIndex) => (
                <tr key={`${month.label}-week-${weekIndex}`}>
                  {week.days.map(day => {
                    const blocked = isDateBlocked(day.date);
                    const selected = day.date === selection.start || day.date === selection.end;
                    const preview = !selection.end && day.date === selection.preview;
                    const inRange = selection.start && rangeEnd
                      ? isDateBetween(day.date, selection.start, rangeEnd)
                      : false;

                    return (
                      <td key={day.date}>
                        <button
                          type="button"
                          className="neo-datepicker__day"
                          data-blocked={blocked ? '' : undefined}
                          data-in-range={inRange ? '' : undefined}
                          data-outside-month={!day.isCurrentMonth ? '' : undefined}
                          data-preview={preview ? '' : undefined}
                          data-selected={selected ? '' : undefined}
                          data-today={day.isToday ? '' : undefined}
                          disabled={blocked}
                          onClick={() => {
                            if (!day.isCurrentMonth) {
                              goTo(day.date);
                            }

                            onDateClick(day.date);
                          }}
                          onFocus={() => onDateHover(day.date)}
                          onMouseEnter={() => onDateHover(day.date)}
                        >
                          {day.dayOfMonth}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
