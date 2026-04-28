import { createMemo, type Accessor } from 'solid-js';
import { buildSpansModel } from '@daywatch/cal-models';
import type { SpansModelConfig } from '@daywatch/cal-models';
import type { SpanInfo } from '@daywatch/cal';
import { toAccessor, type MaybeAccessor } from './utils.js';

export function createSpans(config: MaybeAccessor<SpansModelConfig>): Accessor<SpanInfo[]> {
  const resolvedConfig = toAccessor(config);
  return createMemo(() => buildSpansModel(resolvedConfig()));
}
