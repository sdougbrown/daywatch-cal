// Example - copy and adapt. Unstyled by default. Target data-* attributes and class names with your own CSS.
import { For, createEffect, createMemo, createSignal } from 'solid-js';
import { createIsDateBlocked } from '@daywatch/cal-models';
import { createCalendar, createDateSelection } from '@daywatch/cal-solid';
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

export function DatePicker(props: DatePickerProps) {
  const today = getTodayDateString();
  const [focusDate, setFocusDate] = createSignal(props.selection.start ?? today);

  createEffect(() => {
    if (props.selection.start) {
      setFocusDate(props.selection.start);
    }
  });

  const weekdayLabels = createMemo(() => getWeekdayLabels(props.weekStartsOn ?? 0, props.locale));

  const isDateBlocked = createMemo(() => {
    if (!props.blockedRanges?.length) {
      return () => false;
    }

    return createIsDateBlocked(props.blockedRanges, {
      userTimezone: props.userTimezone,
    });
  });

  // createCalendar owns the month-grid math while this component supplies the markup.
  const calendar = createCalendar(() => ({
    focusDate: focusDate(),
    onFocusDateChange: setFocusDate,
    numberOfMonths: props.numberOfMonths ?? 1,
    ranges: props.ranges,
    fidelity: 'month',
    weekStartsOn: props.weekStartsOn ?? 0,
    locale: props.locale,
    userTimezone: props.userTimezone,
  }));

  // createDateSelection layers controlled click/hover selection on top of the grid.
  const dateSelection = createDateSelection(() => ({
    selection: props.selection,
    onSelectionChange: props.onSelectionChange,
    isDateSelectable: (date) => !isDateBlocked()(date),
  }));

  const rangeEnd = createMemo(() => props.selection.end ?? props.selection.preview);

  return (
    <div class='neo-datepicker'>
      <div class='neo-datepicker__nav'>
        <button type='button' onClick={calendar.prev}>
          Previous
        </button>
        <strong>{calendar.months()[0]?.label}</strong>
        <button type='button' onClick={calendar.next}>
          Next
        </button>
      </div>

      <For each={calendar.months()}>
        {(month) => (
          <div class='neo-datepicker__month'>
            {(props.numberOfMonths ?? 1) > 1 ? <h3>{month.label}</h3> : null}

            <table class='neo-datepicker__grid'>
              <thead>
                <tr>
                  <For each={weekdayLabels()}>
                    {(label) => (
                      <th class='neo-datepicker__weekday' scope='col'>
                        {label}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>

              <tbody>
                <For each={month.weeks}>
                  {(week, weekIndex) => (
                    <tr>
                      <For each={week.days}>
                        {(day) => (
                          <td>
                            <button
                              type='button'
                              class='neo-datepicker__day'
                              data-blocked={isDateBlocked()(day.date) ? '' : undefined}
                              data-in-range={
                                props.selection.start &&
                                rangeEnd() &&
                                isDateBetween(day.date, props.selection.start, rangeEnd())
                                  ? ''
                                  : undefined
                              }
                              data-outside-month={!day.isCurrentMonth ? '' : undefined}
                              data-preview={
                                !props.selection.end && day.date === props.selection.preview
                                  ? ''
                                  : undefined
                              }
                              data-selected={
                                day.date === props.selection.start ||
                                day.date === props.selection.end
                                  ? ''
                                  : undefined
                              }
                              data-today={day.isToday ? '' : undefined}
                              disabled={isDateBlocked()(day.date)}
                              onClick={() => {
                                if (!day.isCurrentMonth) {
                                  calendar.goTo(day.date);
                                }

                                dateSelection.onDateClick(day.date);
                              }}
                              onFocus={() => dateSelection.onDateHover(day.date)}
                              onMouseEnter={() => dateSelection.onDateHover(day.date)}
                            >
                              {day.dayOfMonth}
                            </button>
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </For>
    </div>
  );
}
