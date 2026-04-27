import { createMemo, type Accessor } from 'solid-js';
import { buildCalendarModel, createCalendarController } from '@daywatch/cal-models';
import type { CalendarModelConfig } from '@daywatch/cal-models';
import type { Month } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateCalendarConfig extends CalendarModelConfig {
  onFocusDateChange: (date: string) => void;
}

export interface CreateCalendarResult {
  months: Accessor<Month[]>;
  focusDate: Accessor<string>;
  numberOfMonths: Accessor<number>;
  next: () => void;
  prev: () => void;
  goTo: (date: string) => void;
}

export function createCalendar(config: MaybeAccessor<CreateCalendarConfig>): CreateCalendarResult {
  const resolvedConfig = toAccessor(config);

  const model = createMemo(() => buildCalendarModel(resolvedConfig()));
  const controller = createMemo(() =>
    createCalendarController({
      focusDate: resolvedConfig().focusDate,
    }),
  );

  return {
    months: () => model().months,
    focusDate: () => model().focusDate,
    numberOfMonths: () => model().numberOfMonths,
    next: () => {
      resolvedConfig().onFocusDateChange(controller().next());
    },
    prev: () => {
      resolvedConfig().onFocusDateChange(controller().prev());
    },
    goTo: (date: string) => {
      resolvedConfig().onFocusDateChange(controller().goTo(date));
    },
  };
}
