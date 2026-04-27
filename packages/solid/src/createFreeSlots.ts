import { createMemo, type Accessor } from 'solid-js';
import { buildFreeSlotsModel } from '@daywatch/cal-models';
import type { FreeSlotsModelConfig } from '@daywatch/cal-models';
import type { FreeSlot } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export function createFreeSlots(config: MaybeAccessor<FreeSlotsModelConfig>): Accessor<FreeSlot[]> {
  const resolvedConfig = toAccessor(config);
  return createMemo(() => buildFreeSlotsModel(resolvedConfig()));
}
