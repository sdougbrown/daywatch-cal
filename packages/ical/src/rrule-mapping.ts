import type { DateRange } from '@daywatch/cal';
import ICAL from 'ical.js';

import { ALL_WEEKDAYS, ICAL_TO_RANGE_WEEKDAY, RANGE_TO_ICAL_WEEKDAY } from './constants.js';
import { pad } from './utils.js';

type Recur = InstanceType<typeof ICAL.Recur>;
type Time = InstanceType<typeof ICAL.Time>;

type DateRangeRuleFields = Pick<
  DateRange,
  'fromDate' | 'toDate' | 'fixedBetween' | 'everyWeekday' | 'everyDate' | 'everyMonth'
>;

export interface MapRRuleSuccess {
  supported: true;
  fields: DateRangeRuleFields;
}

export interface MapRRuleFailure {
  supported: false;
  reason: string;
}

export type MapRRuleResult = MapRRuleSuccess | MapRRuleFailure;

function formatDateParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function formatTimeAsDate(value: Time): string {
  return formatDateParts(value.year, value.month, value.day);
}

function hasOrdinalWeekdays(days: readonly string[] | undefined): boolean {
  return Boolean(days?.some((day) => /^[-+]?\d/.test(day)));
}

function getExtraParts(rule: Recur, allowed: readonly string[]): string[] {
  return Object.keys(rule.parts).filter((part) => {
    const values = rule.parts[part as keyof typeof rule.parts];
    return Boolean(values?.length) && !allowed.includes(part);
  });
}

function getCountEndDate(rule: Recur, dtstart: Time): string {
  const iterator = rule.iterator(dtstart);

  let current = iterator.next();
  if (!current) {
    return formatTimeAsDate(dtstart);
  }

  let remaining = Math.max(1, rule.count ?? 1);
  while (remaining > 1) {
    const next = iterator.next();
    if (!next) {
      break;
    }

    current = next;
    remaining -= 1;
  }

  return formatTimeAsDate(current);
}

function getWindowFields(
  rule: Recur,
  dtstart: Time,
): Pick<DateRange, 'fromDate' | 'toDate' | 'fixedBetween'> {
  if (!rule.until && !rule.count) {
    return {
      fromDate: formatTimeAsDate(dtstart),
    };
  }

  return {
    fromDate: formatTimeAsDate(dtstart),
    toDate: rule.until ? formatTimeAsDate(rule.until) : getCountEndDate(rule, dtstart),
    fixedBetween: true,
  };
}

export function mapRRuleToDateRangeFields(rule: Recur, dtstart: Time): MapRRuleResult {
  const baseFields = getWindowFields(rule, dtstart);

  if (rule.interval > 1 && rule.freq !== 'DAILY') {
    return {
      supported: false,
      reason: `INTERVAL=${rule.interval} is not supported for ${rule.freq}`,
    };
  }

  if (hasOrdinalWeekdays(rule.parts.BYDAY)) {
    return {
      supported: false,
      reason: 'ordinal BYDAY rules are not supported',
    };
  }

  switch (rule.freq) {
    case 'DAILY': {
      const extraParts = getExtraParts(rule, []);
      if (extraParts.length > 0) {
        return {
          supported: false,
          reason: `unsupported DAILY rule parts: ${extraParts.join(', ')}`,
        };
      }

      return {
        supported: true,
        fields: {
          ...baseFields,
          everyWeekday: [...ALL_WEEKDAYS],
        },
      };
    }

    case 'WEEKLY': {
      const extraParts = getExtraParts(rule, ['BYDAY']);
      if (extraParts.length > 0) {
        return {
          supported: false,
          reason: `unsupported WEEKLY rule parts: ${extraParts.join(', ')}`,
        };
      }

      const byDay = rule.parts.BYDAY?.length
        ? [...rule.parts.BYDAY]
        : [RANGE_TO_ICAL_WEEKDAY[dtstart.dayOfWeek() % 7]];

      const everyWeekday = byDay.map(
        (day) => ICAL_TO_RANGE_WEEKDAY[day as keyof typeof ICAL_TO_RANGE_WEEKDAY],
      );
      if (everyWeekday.some((day) => day === undefined)) {
        return {
          supported: false,
          reason: `unsupported WEEKLY BYDAY values: ${byDay.join(', ')}`,
        };
      }

      everyWeekday.sort((a, b) => a - b);

      return {
        supported: true,
        fields: {
          ...baseFields,
          everyWeekday,
        },
      };
    }

    case 'MONTHLY': {
      const extraParts = getExtraParts(rule, ['BYMONTHDAY']);
      if (extraParts.length > 0) {
        return {
          supported: false,
          reason: `unsupported MONTHLY rule parts: ${extraParts.join(', ')}`,
        };
      }

      const everyDate = rule.parts.BYMONTHDAY?.length ? [...rule.parts.BYMONTHDAY] : [dtstart.day];

      return {
        supported: true,
        fields: {
          ...baseFields,
          everyDate: everyDate.sort((a, b) => a - b),
        },
      };
    }

    case 'YEARLY': {
      const extraParts = getExtraParts(rule, ['BYMONTH']);
      if (extraParts.length > 0) {
        return {
          supported: false,
          reason: `unsupported YEARLY rule parts: ${extraParts.join(', ')}`,
        };
      }

      const everyMonth = rule.parts.BYMONTH?.length ? [...rule.parts.BYMONTH] : [dtstart.month];

      return {
        supported: true,
        fields: {
          ...baseFields,
          everyMonth: everyMonth.sort((a, b) => a - b),
        },
      };
    }

    default:
      return {
        supported: false,
        reason: `FREQ=${rule.freq} is not supported`,
      };
  }
}

function getUntilTime(range: DateRange): Time {
  const [year, month, day] = (range.toDate ?? range.fromDate ?? '1970-01-01')
    .split('-')
    .map(Number);
  const [hour, minute] = range.startTime?.split(':').map(Number) ?? [0, 0];
  const isDate = !range.startTime;

  if (range.timezone === 'UTC') {
    return ICAL.Time.fromData(
      {
        year,
        month,
        day,
        hour,
        minute,
        second: 0,
        isDate,
      },
      ICAL.Timezone.utcTimezone,
    );
  }

  return ICAL.Time.fromData({
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
    isDate,
  });
}

export function buildRRuleFromDateRange(range: DateRange): Recur | null {
  let data: Parameters<typeof ICAL.Recur.fromData>[0] | null = null;

  if (range.everyDate?.length) {
    data = {
      freq: 'MONTHLY',
      bymonthday: [...range.everyDate].sort((a, b) => a - b),
    };
  } else if (range.everyMonth?.length) {
    data = {
      freq: 'YEARLY',
      bymonth: [...range.everyMonth].sort((a, b) => a - b),
    };
  } else if (range.everyWeekday?.length) {
    data = {
      freq: 'WEEKLY',
      byday: [...range.everyWeekday].sort((a, b) => a - b).map((day) => RANGE_TO_ICAL_WEEKDAY[day]),
    };
  }

  if (!data) {
    return null;
  }

  if (range.fixedBetween && range.toDate) {
    data.until = getUntilTime(range);
  }

  return ICAL.Recur.fromData(data);
}
