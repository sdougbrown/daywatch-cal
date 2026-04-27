import { TimelineGrid, computeEventPositions } from '../src/timeline.js';
import type { CalendarEvent } from '../src/types.js';

function makeEvent(
  id: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): CalendarEvent {
  return {
    id,
    title: id,
    start: new Date(2026, 2, 21, startHour, startMinute),
    end: new Date(2026, 2, 21, endHour, endMinute),
    allDay: false,
    source: 'native',
    sourceId: id,
    editable: true,
  };
}

describe('TimelineGrid', () => {
  it('generates correct number of slots', () => {
    const grid = new TimelineGrid({
      date: '2026-03-21',
      events: [],
      startHour: 8,
      endHour: 18,
      intervalMinutes: 60,
    });

    // 8am to 6pm = 10 hours = 10 slots at 60min granularity
    expect(grid.slots).toHaveLength(10);
    expect(grid.slots[0].time).toBe('08:00');
    expect(grid.slots[9].time).toBe('17:00');
  });

  it('generates 30-minute slots', () => {
    const grid = new TimelineGrid({
      date: '2026-03-21',
      events: [],
      startHour: 9,
      endHour: 10,
      intervalMinutes: 30,
    });

    expect(grid.slots).toHaveLength(2);
    expect(grid.slots[0].time).toBe('09:00');
    expect(grid.slots[1].time).toBe('09:30');
  });

  it('generates 15-minute slots', () => {
    const grid = new TimelineGrid({
      date: '2026-03-21',
      events: [],
      startHour: 9,
      endHour: 10,
      intervalMinutes: 15,
    });

    expect(grid.slots).toHaveLength(4);
  });

  it('places events in overlapping slots', () => {
    const event = makeEvent('meeting', 9, 0, 10, 30);

    const grid = new TimelineGrid({
      date: '2026-03-21',
      events: [event],
      startHour: 8,
      endHour: 12,
      intervalMinutes: 60,
    });

    // 8:00 slot — no events
    expect(grid.slots[0].events).toHaveLength(0);
    // 9:00 slot — event starts here
    expect(grid.slots[1].events).toHaveLength(1);
    // 10:00 slot — event still here (ends at 10:30)
    expect(grid.slots[2].events).toHaveLength(1);
    // 11:00 slot — event ended
    expect(grid.slots[3].events).toHaveLength(0);
  });

  it('defaults to full day (0-24) with 60min slots', () => {
    const grid = new TimelineGrid({
      date: '2026-03-21',
      events: [],
    });

    expect(grid.slots).toHaveLength(24);
    expect(grid.slots[0].time).toBe('00:00');
    expect(grid.slots[23].time).toBe('23:00');
  });
});

describe('computeEventPositions', () => {
  it('positions non-overlapping events in column 0', () => {
    const events = [makeEvent('a', 9, 0, 10, 0), makeEvent('b', 11, 0, 12, 0)];

    const positioned = computeEventPositions(events, 0, 24);
    expect(positioned).toHaveLength(2);
    expect(positioned[0].column).toBe(0);
    expect(positioned[1].column).toBe(0);
    expect(positioned[0].totalColumns).toBe(1);
    expect(positioned[1].totalColumns).toBe(1);
  });

  it('assigns separate columns to overlapping events', () => {
    const events = [makeEvent('a', 9, 0, 11, 0), makeEvent('b', 10, 0, 12, 0)];

    const positioned = computeEventPositions(events, 0, 24);
    expect(positioned).toHaveLength(2);

    const columns = positioned.map((p) => p.column).sort();
    expect(columns).toEqual([0, 1]);
    expect(positioned[0].totalColumns).toBe(2);
    expect(positioned[1].totalColumns).toBe(2);
  });

  it('handles three overlapping events', () => {
    const events = [
      makeEvent('a', 9, 0, 12, 0),
      makeEvent('b', 10, 0, 13, 0),
      makeEvent('c', 11, 0, 14, 0),
    ];

    const positioned = computeEventPositions(events, 0, 24);
    expect(positioned).toHaveLength(3);

    const columns = positioned.map((p) => p.column).sort();
    expect(columns).toEqual([0, 1, 2]);
    expect(positioned[0].totalColumns).toBe(3);
  });

  it('calculates top and height as percentages', () => {
    const events = [makeEvent('a', 6, 0, 12, 0)]; // 6am-noon on a 0-24 grid

    const positioned = computeEventPositions(events, 0, 24);
    expect(positioned[0].top).toBe(25); // 6/24 = 25%
    expect(positioned[0].height).toBe(25); // 6 hours / 24 hours = 25%
  });

  it('calculates positions for custom hour range', () => {
    const events = [makeEvent('a', 9, 0, 10, 0)]; // 1 hour event

    const positioned = computeEventPositions(events, 8, 18); // 10 hour window
    expect(positioned[0].top).toBe(10); // 1 hour into 10 hour window = 10%
    expect(positioned[0].height).toBe(10); // 1 hour of 10 hour window = 10%
  });

  it('returns empty for empty input', () => {
    expect(computeEventPositions([])).toEqual([]);
  });

  it('reuses columns when earlier events end', () => {
    const events = [
      makeEvent('a', 9, 0, 10, 0), // column 0, ends at 10
      makeEvent('b', 9, 0, 10, 0), // column 1, overlaps with a
      makeEvent('c', 10, 30, 12, 0), // column 0, both a and b have ended
    ];

    const positioned = computeEventPositions(events, 0, 24);
    expect(positioned).toHaveLength(3);

    // Events a and b overlap, so 2 columns for that group
    // Event c starts after both a and b end, so it gets its own group
    const eventC = positioned.find((p) => p.event.id === 'c');
    expect(eventC?.column).toBe(0);
    expect(eventC?.totalColumns).toBe(1);
  });
});
