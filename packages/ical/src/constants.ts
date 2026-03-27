export const DEFAULT_PRODID = '-//neo-reckoning//ical//EN';

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const ICAL_TO_RANGE_WEEKDAY = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
} as const;

export const RANGE_TO_ICAL_WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
