import { createMemo, type Accessor } from 'solid-js';
import { updateTimeSelection } from '@daywatch/cal-models';
import type { TimeSelection, TimeSelectionConfig } from '@daywatch/cal-models';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateTimeSelectionConfig extends TimeSelectionConfig {
  onSelectionChange: (selection: TimeSelection) => void;
  selection: TimeSelection;
  date: string;
}

export interface CreateTimeSelectionResult {
  selection: Accessor<TimeSelection>;
  onTimeClick: (time: string) => void;
  onTimeHover: (time: string) => void;
  clear: () => void;
}

export function createTimeSelection(
  config: MaybeAccessor<CreateTimeSelectionConfig>,
): CreateTimeSelectionResult {
  const resolvedConfig = toAccessor(config);
  const selection = createMemo(() => {
    const current = resolvedConfig();

    if (current.selection.date === current.date) {
      return current.selection;
    }

    return {
      ...current.selection,
      date: current.date,
    };
  });

  return {
    selection,
    onTimeClick: (time: string) => {
      const current = resolvedConfig();
      current.onSelectionChange(updateTimeSelection(selection(), { type: 'click', time }, current));
    },
    onTimeHover: (time: string) => {
      const current = resolvedConfig();
      current.onSelectionChange(updateTimeSelection(selection(), { type: 'hover', time }, current));
    },
    clear: () => {
      const current = resolvedConfig();
      current.onSelectionChange(updateTimeSelection(selection(), { type: 'clear' }, current));
    },
  };
}
