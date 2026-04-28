import {
  parseTime,
  formatTime,
  timeToMinutes,
  minutesToTime,
  addMinutes,
  parseDate,
  formatDate,
  getDayOfWeek,
  daysInMonth,
  compareDates,
  dateRange,
  convertTime,
  buildDate,
  formatDateInTimezone,
  getTimeInTimezone,
} from '../src/time.js';

describe('time utilities', () => {
  describe('parseTime', () => {
    it('parses HH:mm format', () => {
      expect(parseTime('06:30')).toEqual({ hour: 6, minute: 30 });
      expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0 });
      expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
    });
  });

  describe('formatTime', () => {
    it('formats with zero-padding', () => {
      expect(formatTime(6, 5)).toBe('06:05');
      expect(formatTime(0, 0)).toBe('00:00');
      expect(formatTime(23, 59)).toBe('23:59');
    });
  });

  describe('timeToMinutes / minutesToTime', () => {
    it('converts between minutes and time strings', () => {
      expect(timeToMinutes('06:30')).toBe(390);
      expect(timeToMinutes('00:00')).toBe(0);
      expect(timeToMinutes('23:59')).toBe(1439);
      expect(minutesToTime(390)).toBe('06:30');
      expect(minutesToTime(0)).toBe('00:00');
    });
  });

  describe('addMinutes', () => {
    it('adds minutes to a time', () => {
      expect(addMinutes('06:00', 120)).toBe('08:00');
      expect(addMinutes('09:30', 45)).toBe('10:15');
    });

    it('returns null when result crosses midnight', () => {
      expect(addMinutes('23:00', 120)).toBeNull();
    });

    it('returns null at exactly midnight', () => {
      expect(addMinutes('23:00', 60)).toBeNull();
    });
  });

  describe('parseDate', () => {
    it('parses YYYY-MM-DD with 0-indexed month', () => {
      expect(parseDate('2026-03-21')).toEqual({
        year: 2026,
        month: 2,
        day: 21,
      });
      expect(parseDate('2026-01-01')).toEqual({ year: 2026, month: 0, day: 1 });
    });
  });

  describe('formatDate', () => {
    it('formats Date to YYYY-MM-DD', () => {
      expect(formatDate(new Date(2026, 2, 21))).toBe('2026-03-21');
      expect(formatDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    });
  });

  describe('getDayOfWeek', () => {
    it('returns correct day of week', () => {
      // 2026-03-21 is a Saturday
      expect(getDayOfWeek('2026-03-21')).toBe(6);
      // 2026-03-23 is a Monday
      expect(getDayOfWeek('2026-03-23')).toBe(1);
    });
  });

  describe('daysInMonth', () => {
    it('returns correct day counts', () => {
      expect(daysInMonth(2026, 1)).toBe(28); // Feb non-leap
      expect(daysInMonth(2024, 1)).toBe(29); // Feb leap
      expect(daysInMonth(2026, 0)).toBe(31); // Jan
      expect(daysInMonth(2026, 3)).toBe(30); // Apr
    });
  });

  describe('compareDates', () => {
    it('compares date strings correctly', () => {
      expect(compareDates('2026-03-01', '2026-03-15')).toBe(-1);
      expect(compareDates('2026-03-15', '2026-03-01')).toBe(1);
      expect(compareDates('2026-03-15', '2026-03-15')).toBe(0);
    });
  });

  describe('dateRange', () => {
    it('generates inclusive date range', () => {
      const range = dateRange('2026-03-01', '2026-03-05');
      expect(range).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
    });

    it('returns single date when from equals to', () => {
      expect(dateRange('2026-03-01', '2026-03-01')).toEqual(['2026-03-01']);
    });

    it('returns empty when from is after to', () => {
      expect(dateRange('2026-03-05', '2026-03-01')).toEqual([]);
    });
  });

  describe('timezone helpers', () => {
    it('converts UTC time to America/New_York', () => {
      expect(convertTime('2026-03-21', '14:00', 'UTC', 'America/New_York')).toBe('10:00');
    });

    it('returns null for a spring-forward DST gap', () => {
      expect(convertTime('2026-03-08', '02:30', 'America/New_York', 'UTC')).toBeNull();
    });

    it('builds UTC dates without shifting the instant', () => {
      expect(buildDate('2026-03-21', '14:00', 'UTC').toISOString()).toBe(
        '2026-03-21T14:00:00.000Z',
      );
    });

    it('formats dates in a specific timezone', () => {
      expect(formatDateInTimezone(new Date('2026-03-21T01:30:00.000Z'), 'America/New_York')).toBe(
        '2026-03-20',
      );
    });

    it('reads clock time in a specific timezone', () => {
      expect(getTimeInTimezone(new Date('2026-03-21T14:45:00.000Z'), 'America/New_York')).toEqual({
        hour: 10,
        minute: 45,
      });
    });
  });
});
