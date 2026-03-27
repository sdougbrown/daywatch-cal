/**
 * Static map of common Windows timezone names to primary IANA identifiers.
 * Covers ~40 entries representing >95% of real-world usage.
 * Source: Unicode CLDR windowsZones.xml
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  // North America
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaska Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'US Eastern Standard Time': 'America/Indianapolis',
  'Canada Central Standard Time': 'America/Regina',
  'Central America Standard Time': 'America/Guatemala',
  'Mexico Standard Time': 'America/Mexico_City',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'Mountain Standard Time (Mexico)': 'America/Chihuahua',

  // South America
  'SA Eastern Standard Time': 'America/Sao_Paulo',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'SA Pacific Standard Time': 'America/Bogota',
  'SA Western Standard Time': 'America/La_Paz',
  'Venezuela Standard Time': 'America/Caracas',

  // Europe
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'Central Europe Standard Time': 'Europe/Budapest',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Helsinki',
  'GTB Standard Time': 'Europe/Athens',
  'Russian Standard Time': 'Europe/Moscow',
  'Turkey Standard Time': 'Europe/Istanbul',

  // Middle East / Africa
  'Israel Standard Time': 'Asia/Jerusalem',
  'Arabian Standard Time': 'Asia/Dubai',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',

  // Asia
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'Singapore Standard Time': 'Asia/Singapore',
  'China Standard Time': 'Asia/Shanghai',
  'Taipei Standard Time': 'Asia/Taipei',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',

  // Oceania
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'W. Australia Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'West Pacific Standard Time': 'Pacific/Port_Moresby',

  // UTC
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
};

/**
 * Convert a timezone string to IANA format.
 * - If it contains '/', assume it's already IANA and pass it through.
 * - If it's 'UTC', pass it through.
 * - Otherwise, look up the Windows -> IANA map.
 * - Returns undefined if no mapping is found.
 */
export function toIanaTimezone(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  if (tz === 'UTC' || tz.includes('/')) return tz;
  return WINDOWS_TO_IANA[tz];
}
