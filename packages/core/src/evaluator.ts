import type { DateRange, Occurrence, TimeSlot, SpanInfo } from './types.js';
import {
  parseDate,
  getDayOfWeek,
  daysInMonth,
  compareDates,
  dateRange,
  parseTime,
  formatTime,
  timeToMinutes,
  addMinutes,
  convertTime,
  formatDate,
} from './time.js';

/**
 * RangeEvaluator — the core computation engine of neo-reckoning.
 *
 * Determines whether dates/times fall within a DateRange and expands
 * ranges into concrete occurrences within a given window.
 */
export class RangeEvaluator {
  private userTimezone: string;

  constructor(userTimezone?: string) {
    this.userTimezone = userTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Check if a date (YYYY-MM-DD) falls within a range's day-level criteria.
   */
  isDateInRange(dateStr: string, range: DateRange): boolean {
    // Check fixedBetween / fromDate / toDate bounds first
    if (!this.isDateInBounds(dateStr, range)) {
      return false;
    }

    // Explicit dates list
    if (range.dates && range.dates.length > 0) {
      return range.dates.includes(dateStr);
    }

    // Recurrence patterns — if any are set, ALL set patterns must match (AND)
    const hasRecurrence = range.everyWeekday || range.everyDate || range.everyMonth;
    if (!hasRecurrence) {
      // No day-level recurrence and no explicit dates — range applies to all days in bounds
      return true;
    }

    const { year, month, day } = parseDate(dateStr);
    const weekday = getDayOfWeek(dateStr);

    if (range.everyWeekday && !range.everyWeekday.includes(weekday)) {
      return false;
    }

    if (range.everyDate && !range.everyDate.includes(day)) {
      return false;
    }

    if (range.everyMonth && !range.everyMonth.includes(month + 1)) {
      return false;
    }

    return true;
  }

  /**
   * Get all time occurrences for a range on a specific day.
   * Returns empty array for all-day ranges (check isDateInRange instead).
   */
  getTimeSlots(dateStr: string, range: DateRange): TimeSlot[] {
    if (!this.hasTimeFields(range)) {
      return [];
    }

    const slots: TimeSlot[] = [];

    if (range.everyHour) {
      for (const hour of range.everyHour) {
        const startTime = formatTime(hour, 0);
        const resolved = this.resolveTime(dateStr, startTime, range.timezone);
        if (resolved === null) continue; // DST gap

        let endTime: string | null = null;
        let duration: number | null = range.duration ?? null;
        if (duration) {
          endTime = addMinutes(resolved, duration);
        }

        slots.push({
          startTime: resolved,
          endTime,
          duration,
          rangeId: range.id,
          label: range.label,
        });
      }
    } else if (range.startTime) {
      const resolvedStart = this.resolveTime(dateStr, range.startTime, range.timezone);
      if (resolvedStart === null) return slots; // DST gap

      if (range.repeatEvery) {
        const endBoundary = range.endTime
          ? this.resolveTime(dateStr, range.endTime, range.timezone) ?? '24:00'
          : '24:00';
        const endMinutes = timeToMinutes(endBoundary);
        let currentMinutes = timeToMinutes(resolvedStart);

        while (currentMinutes < endMinutes) {
          const startTime = formatTime(Math.floor(currentMinutes / 60), currentMinutes % 60);
          let endTime: string | null = null;
          let duration: number | null = range.duration ?? null;
          if (duration) {
            endTime = addMinutes(startTime, duration);
          }

          slots.push({
            startTime,
            endTime,
            duration,
            rangeId: range.id,
            label: range.label,
          });

          currentMinutes += range.repeatEvery;
        }
      } else {
        // Single time block
        let endTime: string | null = null;
        if (range.endTime) {
          endTime = this.resolveTime(dateStr, range.endTime, range.timezone);
        }

        let duration: number | null = range.duration ?? null;
        if (!duration && endTime) {
          duration = timeToMinutes(endTime) - timeToMinutes(resolvedStart);
        }
        if (!endTime && duration) {
          endTime = addMinutes(resolvedStart, duration);
        }

        slots.push({
          startTime: resolvedStart,
          endTime,
          duration,
          rangeId: range.id,
          label: range.label,
        });
      }
    }

    // Sort by start time
    slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    return slots;
  }

  /**
   * Check if a specific datetime falls within a range (both day and time criteria).
   */
  isInRange(datetime: Date, range: DateRange): boolean {
    const dateStr = formatDate(datetime);
    if (!this.isDateInRange(dateStr, range)) {
      return false;
    }

    if (!this.hasTimeFields(range)) {
      return true; // All-day range, day match is sufficient
    }

    const hour = datetime.getHours();
    const minute = datetime.getMinutes();
    const timeStr = formatTime(hour, minute);
    const currentMinutes = timeToMinutes(timeStr);

    const slots = this.getTimeSlots(dateStr, range);
    for (const slot of slots) {
      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = slot.endTime ? timeToMinutes(slot.endTime) : slotStart + (slot.duration ?? 0);

      if (currentMinutes >= slotStart && currentMinutes < slotEnd) {
        return true;
      }

      // Point-in-time occurrence (no duration/end) — exact match
      if (!slot.endTime && !slot.duration && currentMinutes === slotStart) {
        return true;
      }
    }

    return false;
  }

  /**
   * Expand a DateRange into all concrete occurrences within a date window.
   * This is the core computation described in the plan's Addendum C.
   */
  expand(range: DateRange, from: Date, to: Date): Occurrence[] {
    const fromStr = formatDate(from);
    const toStr = formatDate(to);

    // Step 1: Generate candidate days
    const candidateDays = this.getCandidateDays(range, fromStr, toStr);

    // Step 2: Generate occurrences for each day
    const occurrences: Occurrence[] = [];

    for (const day of candidateDays) {
      if (this.hasTimeFields(range)) {
        const slots = this.getTimeSlots(day, range);
        for (const slot of slots) {
          occurrences.push({
            date: day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            rangeId: range.id,
            label: range.label,
            allDay: false,
            ...(range.displayType !== undefined ? { displayType: range.displayType } : {}),
          });
        }
      } else {
        occurrences.push({
          date: day,
          startTime: null,
          endTime: null,
          rangeId: range.id,
          label: range.label,
          allDay: true,
          ...(range.displayType !== undefined ? { displayType: range.displayType } : {}),
        });
      }
    }

    return occurrences;
  }

  /**
   * Expand a DateRange for a single day — convenience for day/week views.
   */
  expandDay(range: DateRange, dateStr: string): TimeSlot[] {
    if (!this.isDateInRange(dateStr, range)) {
      return [];
    }
    return this.getTimeSlots(dateStr, range);
  }

  /**
   * Compute contiguous spans for multiple ranges within a date window.
   * Groups consecutive matching days into SpanInfo objects, assigns lanes
   * using greedy interval scheduling, and computes overlap metrics.
   */
  computeSpans(ranges: DateRange[], from: Date, to: Date): SpanInfo[] {
    const fromStr = formatDate(from);
    const toStr = formatDate(to);

    // Step 1: For each range, find matching days and group into contiguous spans
    interface RawSpan {
      rangeId: string;
      label: string;
      displayType?: string;
      startDate: string;
      endDate: string;
      days: string[];
    }

    const allSpans: RawSpan[] = [];

    for (const range of ranges) {
      const candidateDays = this.getCandidateDays(range, fromStr, toStr);
      if (candidateDays.length === 0) continue;

      // Group consecutive days into contiguous spans
      let spanStart = candidateDays[0];
      let prevDate = candidateDays[0];
      let spanDays = [candidateDays[0]];

      for (let i = 1; i < candidateDays.length; i++) {
        const day = candidateDays[i];
        if (this.isNextDay(prevDate, day)) {
          spanDays.push(day);
          prevDate = day;
        } else {
          // End previous span, start new one
          allSpans.push({
            rangeId: range.id,
            label: range.label,
            displayType: range.displayType,
            startDate: spanStart,
            endDate: prevDate,
            days: spanDays,
          });
          spanStart = day;
          prevDate = day;
          spanDays = [day];
        }
      }
      // Push final span
      allSpans.push({
        rangeId: range.id,
        label: range.label,
        displayType: range.displayType,
        startDate: spanStart,
        endDate: prevDate,
        days: spanDays,
      });
    }

    if (allSpans.length === 0) return [];

    // Step 2: Build day-indexed overlap map (day -> list of span indices)
    const dayToSpans = new Map<string, number[]>();
    for (let i = 0; i < allSpans.length; i++) {
      for (const day of allSpans[i].days) {
        const list = dayToSpans.get(day);
        if (list) {
          list.push(i);
        } else {
          dayToSpans.set(day, [i]);
        }
      }
    }

    // Step 3: Assign lanes using greedy interval scheduling
    const sortedIndices = allSpans
      .map((_, i) => i)
      .sort((a, b) => {
        const cmp = compareDates(allSpans[a].startDate, allSpans[b].startDate);
        if (cmp !== 0) return cmp;
        return compareDates(allSpans[a].endDate, allSpans[b].endDate);
      });

    const lanes = new Array<number>(allSpans.length).fill(-1);
    const laneEndDates: string[] = [];

    for (const idx of sortedIndices) {
      const span = allSpans[idx];
      let assigned = -1;
      for (let lane = 0; lane < laneEndDates.length; lane++) {
        if (compareDates(laneEndDates[lane], span.startDate) < 0) {
          assigned = lane;
          break;
        }
      }
      if (assigned === -1) {
        assigned = laneEndDates.length;
        laneEndDates.push(span.endDate);
      } else {
        laneEndDates[assigned] = span.endDate;
      }
      lanes[idx] = assigned;
    }

    // Step 4: Compute maxOverlap per span and totalLanes for overlap groups
    const maxOverlaps = new Array<number>(allSpans.length).fill(1);
    for (let i = 0; i < allSpans.length; i++) {
      for (const day of allSpans[i].days) {
        const overlapping = dayToSpans.get(day)!;
        if (overlapping.length > maxOverlaps[i]) {
          maxOverlaps[i] = overlapping.length;
        }
      }
    }

    // Build overlap groups via BFS on shared-day adjacency
    const spanNeighbors = new Map<number, Set<number>>();
    for (const spanIndices of dayToSpans.values()) {
      if (spanIndices.length > 1) {
        for (const a of spanIndices) {
          if (!spanNeighbors.has(a)) spanNeighbors.set(a, new Set());
          for (const b of spanIndices) {
            if (a !== b) spanNeighbors.get(a)!.add(b);
          }
        }
      }
    }

    const visited = new Set<number>();
    const componentOf = new Array<number>(allSpans.length).fill(-1);
    const components: number[][] = [];

    for (let i = 0; i < allSpans.length; i++) {
      if (visited.has(i)) continue;
      const component: number[] = [];
      const queue = [i];
      visited.add(i);
      while (queue.length > 0) {
        const node = queue.shift()!;
        component.push(node);
        const neighbors = spanNeighbors.get(node);
        if (neighbors) {
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
      }
      const compIdx = components.length;
      components.push(component);
      for (const idx of component) {
        componentOf[idx] = compIdx;
      }
    }

    const componentTotalLanes = components.map(comp => {
      const usedLanes = new Set(comp.map(idx => lanes[idx]));
      return usedLanes.size;
    });

    // Step 5: Build SpanInfo results, sorted by startDate then lane
    const results: SpanInfo[] = [];
    for (let i = 0; i < allSpans.length; i++) {
      const span = allSpans[i];
      results.push({
        rangeId: span.rangeId,
        label: span.label,
        ...(span.displayType !== undefined ? { displayType: span.displayType } : {}),
        startDate: span.startDate,
        endDate: span.endDate,
        length: span.days.length,
        maxOverlap: maxOverlaps[i],
        lane: lanes[i],
        totalLanes: componentTotalLanes[componentOf[i]],
      });
    }

    results.sort((a, b) => {
      const cmp = compareDates(a.startDate, b.startDate);
      if (cmp !== 0) return cmp;
      return a.lane - b.lane;
    });

    return results;
  }

  // === Private helpers ===

  /**
   * Check if dateB is exactly the day after dateA.
   */
  private isNextDay(dateA: string, dateB: string): boolean {
    const { year, month, day } = parseDate(dateA);
    const d = new Date(year, month, day + 1);
    return formatDate(d) === dateB;
  }

  private isDateInBounds(dateStr: string, range: DateRange): boolean {
    if (range.fixedBetween) {
      if (range.fromDate && compareDates(dateStr, range.fromDate) < 0) return false;
      if (range.toDate && compareDates(dateStr, range.toDate) > 0) return false;
    } else {
      if (range.fromDate && compareDates(dateStr, range.fromDate) < 0) return false;
      if (range.toDate && compareDates(dateStr, range.toDate) > 0) return false;
    }
    return true;
  }

  private getCandidateDays(range: DateRange, fromStr: string, toStr: string): string[] {
    // Determine the effective window
    let effectiveFrom = fromStr;
    let effectiveTo = toStr;

    if (range.fromDate && compareDates(range.fromDate, effectiveFrom) > 0) {
      effectiveFrom = range.fromDate;
    }
    if (range.toDate && compareDates(range.toDate, effectiveTo) < 0) {
      effectiveTo = range.toDate;
    }

    if (compareDates(effectiveFrom, effectiveTo) > 0) {
      return []; // No overlap between range bounds and query window
    }

    // Explicit dates — just filter to the window
    if (range.dates && range.dates.length > 0) {
      return range.dates.filter(
        d => compareDates(d, effectiveFrom) >= 0 && compareDates(d, effectiveTo) <= 0,
      );
    }

    // Generate all days in the window and filter by recurrence
    const allDays = dateRange(effectiveFrom, effectiveTo);
    return allDays.filter(day => this.isDateInRange(day, range));
  }

  private hasTimeFields(range: DateRange): boolean {
    return !!(range.everyHour || range.startTime);
  }

  /**
   * Resolve a time in the range's timezone to the user's timezone.
   * Returns null if the time doesn't exist (DST spring-forward gap).
   * Returns the time unchanged if the range has no timezone (floating).
   */
  private resolveTime(dateStr: string, time: string, timezone?: string | null): string | null {
    if (!timezone) {
      return time; // Floating — no conversion
    }
    return convertTime(dateStr, time, timezone, this.userTimezone);
  }
}
