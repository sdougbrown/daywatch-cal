import { formatTime, minutesToTime, parseTime, timeToMinutes } from '@daywatch/cal';

export interface TimeSelection {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string | null;
  /** HH:mm */
  endTime: string | null;
  /** HH:mm */
  preview: string | null;
}

export interface TimeSelectionConfig {
  /** Snap granularity in minutes. Default: 30 */
  intervalMinutes?: number;
  /** Predicate to check if a time slot can be selected */
  isTimeSelectable?: (time: string) => boolean;
  /** Minimum selection duration in minutes. Default: 15 */
  minDuration?: number;
  /** Earliest selectable time. Default: "00:00" */
  dayStart?: string;
  /** Latest selectable time. Default: "24:00" */
  dayEnd?: string;
}

export type TimeSelectionAction =
  | { type: 'click'; time: string }
  | { type: 'hover'; time: string }
  | { type: 'clear' };

function buildSelection(selection: TimeSelection, next: TimeSelection): TimeSelection {
  if (
    selection.date === next.date &&
    selection.startTime === next.startTime &&
    selection.endTime === next.endTime &&
    selection.preview === next.preview
  ) {
    return selection;
  }

  return next;
}

function clearSelection(selection: TimeSelection): TimeSelection {
  return buildSelection(selection, {
    date: selection.date,
    startTime: null,
    endTime: null,
    preview: null,
  });
}

function clampTime(time: string, dayStartMinutes: number, dayEndMinutes: number): string {
  const clamped = Math.min(Math.max(timeToMinutes(time), dayStartMinutes), dayEndMinutes);
  return minutesToTime(clamped);
}

export function snapToInterval(time: string, intervalMinutes: number): string {
  const { hour, minute } = parseTime(time);
  const totalMinutes = hour * 60 + minute;
  const safeInterval = intervalMinutes > 0 ? intervalMinutes : 1;
  const snappedMinutes = Math.floor(totalMinutes / safeInterval) * safeInterval;

  return formatTime(Math.floor(snappedMinutes / 60), snappedMinutes % 60);
}

export function updateTimeSelection(
  selection: TimeSelection,
  action: TimeSelectionAction,
  config?: TimeSelectionConfig,
): TimeSelection {
  const intervalMinutes = config?.intervalMinutes ?? 30;
  const minDuration = config?.minDuration ?? 15;
  const dayStartMinutes = timeToMinutes(config?.dayStart ?? '00:00');
  const dayEndMinutes = timeToMinutes(config?.dayEnd ?? '24:00');

  if (action.type === 'clear') {
    return clearSelection(selection);
  }

  const snapped = snapToInterval(action.time, intervalMinutes);
  const clamped = clampTime(snapped, dayStartMinutes, dayEndMinutes);

  if (config?.isTimeSelectable && !config.isTimeSelectable(clamped)) {
    return selection;
  }

  if (action.type === 'hover') {
    if (!selection.startTime || selection.endTime) {
      return selection;
    }

    return buildSelection(selection, {
      date: selection.date,
      startTime: selection.startTime,
      endTime: selection.endTime,
      preview: clamped,
    });
  }

  if (!selection.startTime) {
    return buildSelection(selection, {
      date: selection.date,
      startTime: clamped,
      endTime: null,
      preview: null,
    });
  }

  if (!selection.endTime) {
    let startMinutes = timeToMinutes(selection.startTime);
    let endMinutes = timeToMinutes(clamped);

    if (endMinutes < startMinutes) {
      [startMinutes, endMinutes] = [endMinutes, startMinutes];
    }

    if (endMinutes - startMinutes < minDuration) {
      endMinutes = startMinutes + minDuration;
    }

    endMinutes = Math.min(Math.max(endMinutes, dayStartMinutes), dayEndMinutes);
    startMinutes = Math.min(Math.max(startMinutes, dayStartMinutes), dayEndMinutes);

    return buildSelection(selection, {
      date: selection.date,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
      preview: null,
    });
  }

  return buildSelection(selection, {
    date: selection.date,
    startTime: clamped,
    endTime: null,
    preview: null,
  });
}
