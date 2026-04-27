import { useCallback, useMemo } from 'react';
import { updateTimeSelection } from '@daywatch/cal-models';
import type { TimeSelection, TimeSelectionConfig } from '@daywatch/cal-models';

export interface UseTimeSelectionConfig extends TimeSelectionConfig {
  onSelectionChange: (selection: TimeSelection) => void;
  selection: TimeSelection;
  date: string;
}

export interface UseTimeSelectionResult {
  selection: TimeSelection;
  onTimeClick: (time: string) => void;
  onTimeHover: (time: string) => void;
  clear: () => void;
}

export function useTimeSelection(config: UseTimeSelectionConfig): UseTimeSelectionResult {
  const selection = useMemo(() => {
    if (config.selection.date === config.date) {
      return config.selection;
    }

    return {
      ...config.selection,
      date: config.date,
    };
  }, [config.selection, config.date]);

  const onTimeClick = useCallback(
    (time: string) => {
      config.onSelectionChange(updateTimeSelection(selection, { type: 'click', time }, config));
    },
    [config, selection],
  );

  const onTimeHover = useCallback(
    (time: string) => {
      config.onSelectionChange(updateTimeSelection(selection, { type: 'hover', time }, config));
    },
    [config, selection],
  );

  const clear = useCallback(() => {
    config.onSelectionChange(updateTimeSelection(selection, { type: 'clear' }, config));
  }, [config, selection]);

  return {
    selection,
    onTimeClick,
    onTimeHover,
    clear,
  };
}
