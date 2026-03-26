import { useMemo } from 'react';
import { buildConflictsModel } from '@neo-reckoning/models';
import type { ConflictsModelConfig } from '@neo-reckoning/models';
import type { Conflict } from '@neo-reckoning/core';

export interface UseConflictsConfig extends ConflictsModelConfig {}

/**
 * Conflict detection hook — returns Conflict[] for all time-level conflicts
 * between ranges within the given date window.
 */
export function useConflicts(config: UseConflictsConfig): Conflict[] {
  const { ranges, from, to, userTimezone } = config;

  return useMemo(
    () => buildConflictsModel({ ranges, from, to, userTimezone }),
    [ranges, from, to, userTimezone],
  );
}
