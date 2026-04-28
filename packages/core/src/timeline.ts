import type { TimelineGridConfig, TimelineSlot, PositionedEvent, CalendarEvent } from './types.js';
import { formatTime } from './time.js';

/**
 * TimelineGrid — produces the data structure for rendering hourly/timeline
 * day views. Handles event positioning including overlap detection for
 * side-by-side concurrent events.
 */
export class TimelineGrid {
  slots: TimelineSlot[];

  private date: string;
  private startHour: number;
  private endHour: number;
  private intervalMinutes: number;
  private events: CalendarEvent[];

  constructor(config: TimelineGridConfig) {
    this.date = config.date;
    this.startHour = config.startHour ?? 0;
    this.endHour = config.endHour ?? 24;
    this.intervalMinutes = config.intervalMinutes ?? 60;
    this.events = config.events;
    this.slots = this.generate();
  }

  private generate(): TimelineSlot[] {
    const slots: TimelineSlot[] = [];
    const positioned = computeEventPositions(this.events, this.startHour, this.endHour);

    let currentMinutes = this.startHour * 60;
    const endMinutes = this.endHour * 60;

    while (currentMinutes < endMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const minute = currentMinutes % 60;
      const time = formatTime(hour, minute);

      // Find events that overlap this slot
      const slotEnd = currentMinutes + this.intervalMinutes;
      const overlapping = positioned.filter((pe) => {
        const eventStart = this.getEventStartMinutes(pe.event);
        const eventEnd = this.getEventEndMinutes(pe.event);
        return eventStart < slotEnd && eventEnd > currentMinutes;
      });

      slots.push({
        time,
        hour,
        minute,
        events: overlapping,
      });

      currentMinutes += this.intervalMinutes;
    }

    return slots;
  }

  private getEventStartMinutes(event: CalendarEvent): number {
    return event.start.getHours() * 60 + event.start.getMinutes();
  }

  private getEventEndMinutes(event: CalendarEvent): number {
    if (event.end) {
      return event.end.getHours() * 60 + event.end.getMinutes();
    }
    // Default to 30 minutes if no end time
    return this.getEventStartMinutes(event) + 30;
  }
}

/**
 * Compute positioned events with column assignments for overlapping events.
 * Uses a greedy column-assignment algorithm.
 */
export function computeEventPositions(
  events: CalendarEvent[],
  startHour: number = 0,
  endHour: number = 24,
): PositionedEvent[] {
  if (events.length === 0) return [];

  const totalMinutes = (endHour - startHour) * 60;
  const timelineStart = startHour * 60;

  // Sort by start time, then by duration (longer first)
  const sorted = [...events].sort((a, b) => {
    const aStart = a.start.getHours() * 60 + a.start.getMinutes();
    const bStart = b.start.getHours() * 60 + b.start.getMinutes();
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = a.end ? a.end.getHours() * 60 + a.end.getMinutes() : aStart + 30;
    const bEnd = b.end ? b.end.getHours() * 60 + b.end.getMinutes() : bStart + 30;
    return bEnd - bStart - (aEnd - aStart); // Longer events first
  });

  // Assign columns using a greedy approach
  // Track when each column becomes free
  const columnEnds: number[] = [];
  const assignments: Array<{
    event: CalendarEvent;
    column: number;
    startMin: number;
    endMin: number;
  }> = [];

  for (const event of sorted) {
    const eventStart = event.start.getHours() * 60 + event.start.getMinutes();
    const eventEnd = event.end
      ? event.end.getHours() * 60 + event.end.getMinutes()
      : eventStart + 30;

    // Find the first available column
    let assignedColumn = -1;
    for (let col = 0; col < columnEnds.length; col++) {
      if (columnEnds[col] <= eventStart) {
        assignedColumn = col;
        columnEnds[col] = eventEnd;
        break;
      }
    }

    if (assignedColumn === -1) {
      assignedColumn = columnEnds.length;
      columnEnds.push(eventEnd);
    }

    assignments.push({
      event,
      column: assignedColumn,
      startMin: eventStart,
      endMin: eventEnd,
    });
  }

  // Compute total columns for each group of overlapping events
  // We need to find connected components of overlapping events
  const groups = findOverlapGroups(assignments);

  const positioned: PositionedEvent[] = [];

  for (const group of groups) {
    const maxColumn = Math.max(...group.map((a) => a.column)) + 1;

    for (const assignment of group) {
      const top = ((assignment.startMin - timelineStart) / totalMinutes) * 100;
      const height = ((assignment.endMin - assignment.startMin) / totalMinutes) * 100;

      positioned.push({
        event: assignment.event,
        top: Math.max(0, top),
        height: Math.min(height, 100 - Math.max(0, top)),
        column: assignment.column,
        totalColumns: maxColumn,
      });
    }
  }

  return positioned;
}

/**
 * Find groups of events that overlap with each other (connected components).
 */
function findOverlapGroups(
  assignments: Array<{
    event: CalendarEvent;
    column: number;
    startMin: number;
    endMin: number;
  }>,
): Array<
  Array<{
    event: CalendarEvent;
    column: number;
    startMin: number;
    endMin: number;
  }>
> {
  if (assignments.length === 0) return [];

  const sorted = [...assignments].sort((a, b) => a.startMin - b.startMin);
  const groups: Array<Array<(typeof sorted)[number]>> = [];
  let currentGroup: Array<(typeof sorted)[number]> = [sorted[0]];
  let groupEnd = sorted[0].endMin;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startMin < groupEnd) {
      // Overlaps with current group
      currentGroup.push(sorted[i]);
      groupEnd = Math.max(groupEnd, sorted[i].endMin);
    } else {
      // New group
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
      groupEnd = sorted[i].endMin;
    }
  }

  groups.push(currentGroup);
  return groups;
}
