import { createMemo, type Accessor } from 'solid-js';
import { updateDateSelection } from '@neo-reckoning/models';
import type {
  DateSelection,
  DateSelectionConfig,
} from '@neo-reckoning/models';
import { toAccessor, type MaybeAccessor } from './utils.js';

export interface CreateDateSelectionConfig extends DateSelectionConfig {
  onSelectionChange: (selection: DateSelection) => void;
  selection: DateSelection;
}

export interface CreateDateSelectionResult {
  selection: Accessor<DateSelection>;
  onDateClick: (date: string) => void;
  onDateHover: (date: string) => void;
  clear: () => void;
}

export function createDateSelection(
  config: MaybeAccessor<CreateDateSelectionConfig>,
): CreateDateSelectionResult {
  const resolvedConfig = toAccessor(config);
  const selection = createMemo(() => resolvedConfig().selection);

  return {
    selection,
    onDateClick: (date: string) => {
      const current = resolvedConfig();
      current.onSelectionChange(updateDateSelection(selection(), { type: 'click', date }, current));
    },
    onDateHover: (date: string) => {
      const current = resolvedConfig();
      current.onSelectionChange(updateDateSelection(selection(), { type: 'hover', date }, current));
    },
    clear: () => {
      const current = resolvedConfig();
      current.onSelectionChange(updateDateSelection(selection(), { type: 'clear' }, current));
    },
  };
}
