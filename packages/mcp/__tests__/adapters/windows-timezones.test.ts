import { toIanaTimezone } from '../../src/adapters/windows-timezones.js';

describe('toIanaTimezone', () => {
  it('maps common Windows timezone names to IANA', () => {
    expect(toIanaTimezone('Eastern Standard Time')).toBe('America/New_York');
    expect(toIanaTimezone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(toIanaTimezone('Central Standard Time')).toBe('America/Chicago');
    expect(toIanaTimezone('Mountain Standard Time')).toBe('America/Denver');
    expect(toIanaTimezone('GMT Standard Time')).toBe('Europe/London');
    expect(toIanaTimezone('W. Europe Standard Time')).toBe('Europe/Berlin');
    expect(toIanaTimezone('Tokyo Standard Time')).toBe('Asia/Tokyo');
    expect(toIanaTimezone('AUS Eastern Standard Time')).toBe('Australia/Sydney');
    expect(toIanaTimezone('India Standard Time')).toBe('Asia/Kolkata');
    expect(toIanaTimezone('New Zealand Standard Time')).toBe('Pacific/Auckland');
  });

  it('passes through IANA timezone strings unchanged', () => {
    expect(toIanaTimezone('America/New_York')).toBe('America/New_York');
    expect(toIanaTimezone('Europe/London')).toBe('Europe/London');
    expect(toIanaTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('passes through UTC', () => {
    expect(toIanaTimezone('UTC')).toBe('UTC');
    expect(toIanaTimezone('Coordinated Universal Time')).toBe('UTC');
  });

  it('returns undefined for unknown Windows timezone names', () => {
    expect(toIanaTimezone('Fake Standard Time')).toBeUndefined();
    expect(toIanaTimezone('Not A Timezone')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(toIanaTimezone(undefined)).toBeUndefined();
  });
});
