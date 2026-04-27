import { useCallback } from 'react';
import { updateDateSelection } from '@daywatch/cal-models';
import type { DateSelection, DateSelectionConfig } from '@daywatch/cal-models';

export interface UseDateSelectionConfig extends DateSelectionConfig {
  /** Called when selection changes */
  onSelectionChange: (selection: DateSelection) => void;
  /** Current controlled selection state */
  selection: DateSelection;
}

export interface UseDateSelectionResult {
  selection: DateSelection;
  onDateClick: (date: string) => void;
  onDateHover: (date: string) => void;
  clear: () => void;
}

export function useDateSelection(config: UseDateSelectionConfig): UseDateSelectionResult {
  const onDateClick = useCallback(
    (date: string) => {
      config.onSelectionChange(
        updateDateSelection(config.selection, { type: 'click', date }, config),
      );
    },
    [config],
  );

  const onDateHover = useCallback(
    (date: string) => {
      config.onSelectionChange(
        updateDateSelection(config.selection, { type: 'hover', date }, config),
      );
    },
    [config],
  );

  const clear = useCallback(() => {
    config.onSelectionChange(updateDateSelection(config.selection, { type: 'clear' }, config));
  }, [config]);

  return {
    selection: config.selection,
    onDateClick,
    onDateHover,
    clear,
  };
}
