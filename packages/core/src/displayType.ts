import type { DateRange, ViewFidelity } from './types.js';

/**
 * Resolve the effective display type for a range at a given fidelity level.
 * If the range has an explicit displayType (not 'auto'), it is returned as-is.
 * Otherwise, auto-resolution picks a sensible default based on range characteristics
 * and the current view fidelity.
 */
export function resolveDisplayType(range: DateRange, fidelity: ViewFidelity): string {
  if (range.displayType && range.displayType !== 'auto') {
    return range.displayType;
  }

  // Auto-resolve based on range characteristics and view fidelity
  if (fidelity === 'year') return 'dot';

  if (range.startTime || range.everyHour) {
    return fidelity === 'month' ? 'chip' : 'block';
  }

  if (range.fromDate && range.toDate) return 'span';
  if (range.dates && range.dates.length === 1) return 'dot';

  return 'fill';
}
