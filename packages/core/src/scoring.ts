import type { DateRange, ScheduleScore, TimeSlot } from './types.js';
import { RangeEvaluator } from './evaluator.js';
import { formatDate, dateRange, timeToMinutes } from './time.js';

/**
 * Score a schedule across a date window.
 *
 * Analyses conflicts, free time, focus blocks, and context switches
 * for a set of DateRanges evaluated within [from, to].
 */
export function scoreSchedule(
  evaluator: RangeEvaluator,
  ranges: DateRange[],
  from: Date,
  to: Date,
  options?: {
    focusBlockMinutes?: number;
    dayStart?: string;
    dayEnd?: string;
  },
): ScheduleScore {
  const focusBlockMinutes = options?.focusBlockMinutes ?? 60;
  const dayStartMin = timeToMinutes(options?.dayStart ?? '09:00');
  const dayEndMin = timeToMinutes(options?.dayEnd ?? '17:00');

  const fromStr = formatDate(from);
  const toStr = formatDate(to);
  const days = dateRange(fromStr, toStr);

  let totalConflicts = 0;
  let totalFreeMinutes = 0;
  let totalFocusBlocks = 0;
  let totalContextSwitches = 0;
  let conflictDays = 0;

  for (const day of days) {
    const timedEntries = evaluator.getTimedEntriesForDay(ranges, day);
    const allSlots: TimeSlot[] = timedEntries.map(entry => entry.slot);

    // --- Conflicts ---
    // Count pairs of slots that overlap in time
    let dayHasConflict = false;
    for (let i = 0; i < timedEntries.length; i++) {
      const slotAStart = timedEntries[i].startMinutes;
      const slotAEnd = timedEntries[i].endMinutes;
      if (slotAEnd <= slotAStart) continue; // skip point-in-time

      for (let j = i + 1; j < timedEntries.length; j++) {
        const slotBStart = timedEntries[j].startMinutes;
        const slotBEnd = timedEntries[j].endMinutes;
        if (slotBEnd <= slotBStart) continue;

        // Since sorted by start, slotBStart >= slotAStart
        if (slotBStart < slotAEnd) {
          totalConflicts++;
          dayHasConflict = true;
        }
      }
    }
    if (dayHasConflict) conflictDays++;

    // --- Build merged occupied intervals within working hours ---
    const occupied = mergeIntervals(timedEntries, dayStartMin, dayEndMin);

    // --- Free time = working hours minus occupied ---
    const workingMinutes = dayEndMin - dayStartMin;
    let occupiedMinutes = 0;
    for (const [s, e] of occupied) {
      occupiedMinutes += e - s;
    }
    const freeMinutes = workingMinutes - occupiedMinutes;
    totalFreeMinutes += freeMinutes;

    // --- Focus blocks: gaps within working hours >= focusBlockMinutes ---
    const gaps = computeGaps(occupied, dayStartMin, dayEndMin);
    for (const [s, e] of gaps) {
      if (e - s >= focusBlockMinutes) {
        totalFocusBlocks++;
      }
    }

    // --- Context switches ---
    // Transitions between different rangeIds in chronological order
    let switches = 0;
    let lastRangeId: string | null = null;
    for (const slot of allSlots) {
      if (lastRangeId !== null && slot.rangeId !== lastRangeId) {
        switches++;
      }
      lastRangeId = slot.rangeId;
    }
    totalContextSwitches += switches;
  }

  const avgContextSwitches = days.length > 0 ? totalContextSwitches / days.length : 0;

  return {
    conflicts: totalConflicts,
    freeMinutes: totalFreeMinutes,
    focusBlocks: totalFocusBlocks,
    avgContextSwitches,
    conflictDays,
  };
}

/**
 * Merge time slots into non-overlapping intervals, clipped to [dayStart, dayEnd].
 * Returns sorted array of [start, end] minute pairs.
 */
function mergeIntervals(
  timedEntries: Array<{ slot: TimeSlot; startMinutes: number; endMinutes: number }>,
  dayStartMin: number,
  dayEndMin: number,
): [number, number][] {
  // Convert to minute intervals, clipped to working hours
  const intervals: [number, number][] = [];
  for (const entry of timedEntries) {
    const start = entry.startMinutes;
    const end = entry.endMinutes;
    if (end <= start) continue; // skip zero-length

    const clippedStart = Math.max(start, dayStartMin);
    const clippedEnd = Math.min(end, dayEndMin);
    if (clippedStart < clippedEnd) {
      intervals.push([clippedStart, clippedEnd]);
    }
  }

  if (intervals.length === 0) return [];

  // Sort by start
  intervals.sort((a, b) => a[0] - b[0]);

  // Merge overlapping
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      merged.push(intervals[i]);
    }
  }

  return merged;
}

/**
 * Compute gaps between merged intervals within [dayStart, dayEnd].
 */
function computeGaps(
  merged: [number, number][],
  dayStartMin: number,
  dayEndMin: number,
): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = dayStartMin;

  for (const [s, e] of merged) {
    if (s > cursor) {
      gaps.push([cursor, s]);
    }
    cursor = Math.max(cursor, e);
  }

  if (cursor < dayEndMin) {
    gaps.push([cursor, dayEndMin]);
  }

  return gaps;
}
