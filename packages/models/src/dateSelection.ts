import { RangeEvaluator } from '@neo-reckoning/core';
import type { DateRange } from '@neo-reckoning/core';

export interface DateSelection {
  /** YYYY-MM-DD */
  start: string | null;
  /** YYYY-MM-DD */
  end: string | null;
  /** YYYY-MM-DD */
  preview: string | null;
}

export interface DateSelectionConfig {
  /** Predicate to check if a date can be selected. Return false to block. */
  isDateSelectable?: (date: string) => boolean;
  /** Allow start === end as a valid range. Default: true */
  allowSameDay?: boolean;
  /** Reset selection on third click (after both start+end are set). Default: true */
  resetOnThirdClick?: boolean;
}

export type DateSelectionAction =
  | { type: 'click'; date: string }
  | { type: 'hover'; date: string }
  | { type: 'clear' };

function buildSelection(
  selection: DateSelection,
  next: DateSelection,
): DateSelection {
  if (
    selection.start === next.start &&
    selection.end === next.end &&
    selection.preview === next.preview
  ) {
    return selection;
  }

  return next;
}

function clearSelection(selection: DateSelection): DateSelection {
  return buildSelection(selection, {
    start: null,
    end: null,
    preview: null,
  });
}

export function updateDateSelection(
  selection: DateSelection,
  action: DateSelectionAction,
  config?: DateSelectionConfig,
): DateSelection {
  const allowSameDay = config?.allowSameDay ?? true;
  const resetOnThirdClick = config?.resetOnThirdClick ?? true;

  if (action.type === 'clear') {
    return clearSelection(selection);
  }

  if (config?.isDateSelectable && !config.isDateSelectable(action.date)) {
    return selection;
  }

  if (action.type === 'hover') {
    if (!selection.start || selection.end) {
      return selection;
    }

    return buildSelection(selection, {
      start: selection.start,
      end: selection.end,
      preview: action.date,
    });
  }

  if (!selection.start) {
    return buildSelection(selection, {
      start: action.date,
      end: null,
      preview: null,
    });
  }

  if (!selection.end) {
    if (!allowSameDay && action.date === selection.start) {
      return selection;
    }

    const start = action.date < selection.start ? action.date : selection.start;
    const end = action.date < selection.start ? selection.start : action.date;

    return buildSelection(selection, {
      start,
      end,
      preview: null,
    });
  }

  if (!resetOnThirdClick) {
    return selection;
  }

  return buildSelection(selection, {
    start: action.date,
    end: null,
    preview: null,
  });
}

export function createIsDateBlocked(
  ranges: DateRange[],
  options?: { userTimezone?: string },
): (date: string) => boolean {
  const evaluator = new RangeEvaluator(options?.userTimezone);

  return (date: string): boolean => {
    return ranges.some(range => evaluator.isDateInRange(date, range));
  };
}

export function selectionToDateRange(
  selection: DateSelection,
  template?: Partial<DateRange>,
): DateRange | null {
  if (!selection.start || !selection.end) {
    return null;
  }

  return {
    ...template,
    id: `selection-${Date.now()}`,
    label: template?.label ?? '',
    fromDate: selection.start,
    toDate: selection.end,
  };
}
