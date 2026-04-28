import { createMemo, type Accessor } from 'solid-js';
import { buildConflictsModel } from '@daywatch/cal-models';
import type { ConflictsModelConfig } from '@daywatch/cal-models';
import type { Conflict } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export function createConflicts(config: MaybeAccessor<ConflictsModelConfig>): Accessor<Conflict[]> {
  const resolvedConfig = toAccessor(config);
  return createMemo(() => buildConflictsModel(resolvedConfig()));
}
