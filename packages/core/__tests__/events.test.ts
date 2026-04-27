import { fromDateRange, expandToEvents } from '../src/events.js';
import type { DateRange, Occurrence } from '../src/types.js';

describe('event normalization', () => {
  describe('fromDateRange', () => {
    it('creates CalendarEvent from all-day occurrence', () => {
      const range: DateRange = {
        id: 'vacation',
        label: 'Vacation',
        title: 'Spring Break',
      };

      const occurrence: Occurrence = {
        date: '2026-03-21',
        startTime: null,
        endTime: null,
        rangeId: 'vacation',
        label: 'Vacation',
        allDay: true,
      };

      const event = fromDateRange(range, occurrence);
      expect(event.id).toBe('vacation:2026-03-21');
      expect(event.title).toBe('Spring Break');
      expect(event.allDay).toBe(true);
      expect(event.source).toBe('native');
      expect(event.sourceId).toBe('vacation');
      expect(event.editable).toBe(true);
      expect(event.end).toBeNull();
    });

    it('creates CalendarEvent from timed occurrence', () => {
      const range: DateRange = {
        id: 'meeting',
        label: 'Standup',
        startTime: '09:00',
        endTime: '09:30',
      };

      const occurrence: Occurrence = {
        date: '2026-03-23',
        startTime: '09:00',
        endTime: '09:30',
        rangeId: 'meeting',
        label: 'Standup',
        allDay: false,
      };

      const event = fromDateRange(range, occurrence);
      expect(event.id).toBe('meeting:2026-03-23:09:00');
      expect(event.allDay).toBe(false);
      expect(event.start.getHours()).toBe(9);
      expect(event.end?.getMinutes()).toBe(30);
    });

    it('uses label when title is not set', () => {
      const range: DateRange = { id: 'r1', label: 'My Range' };
      const occurrence: Occurrence = {
        date: '2026-03-21',
        startTime: null,
        endTime: null,
        rangeId: 'r1',
        label: 'My Range',
        allDay: true,
      };

      expect(fromDateRange(range, occurrence).title).toBe('My Range');
    });
  });

  describe('expandToEvents', () => {
    it('converts multiple occurrences to CalendarEvents', () => {
      const range: DateRange = {
        id: 'meds',
        label: 'Medication',
        everyHour: [6, 14, 22],
      };

      const occurrences: Occurrence[] = [
        {
          date: '2026-03-21',
          startTime: '06:00',
          endTime: null,
          rangeId: 'meds',
          label: 'Medication',
          allDay: false,
        },
        {
          date: '2026-03-21',
          startTime: '14:00',
          endTime: null,
          rangeId: 'meds',
          label: 'Medication',
          allDay: false,
        },
        {
          date: '2026-03-21',
          startTime: '22:00',
          endTime: null,
          rangeId: 'meds',
          label: 'Medication',
          allDay: false,
        },
      ];

      const events = expandToEvents(range, occurrences);
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('meds:2026-03-21:06:00');
      expect(events[1].id).toBe('meds:2026-03-21:14:00');
      expect(events[2].id).toBe('meds:2026-03-21:22:00');
    });
  });
});
