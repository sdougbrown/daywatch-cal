import { RangeEvaluator, expandToEvents } from '@daywatch/cal';
import type { CalendarEvent, DateRange } from '@daywatch/cal';
import { buildCalendarEvents } from '../src/calendarEvents.js';

describe('buildCalendarEvents', () => {
  it('matches core event expansion and preserves imported events', () => {
    const range: DateRange = {
      id: 'range-1',
      label: 'Morning focus',
      dates: ['2026-03-23'],
      startTime: '09:00',
      endTime: '10:00',
    };
    const importedEvent: CalendarEvent = {
      id: 'imported-1',
      title: 'Imported',
      start: new Date('2026-03-23T12:00:00.000Z'),
      end: new Date('2026-03-23T13:00:00.000Z'),
      allDay: false,
      source: 'imported',
      sourceId: 'sub-1',
      editable: false,
    };
    const from = new Date('2026-03-23T00:00:00.000Z');
    const to = new Date('2026-03-24T00:00:00.000Z');

    const evaluator = new RangeEvaluator();
    const expectedNativeEvents = expandToEvents(range, evaluator.expand(range, from, to));

    const events = buildCalendarEvents({
      ranges: [range],
      importedEvents: [importedEvent],
      from,
      to,
    });

    expect(events).toEqual(
      [...expectedNativeEvents, importedEvent].sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      ),
    );
  });
});
