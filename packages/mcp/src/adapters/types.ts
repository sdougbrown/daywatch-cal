import type { DateRange } from '@daywatch/cal';

/** An attendee entry from the raw Google Calendar API format. */
export interface GCalEventAttendee {
  email?: string;
  responseStatus?: string;
  self?: boolean;
}

/** Google Calendar event as returned by gcal_list_events (condensed format). */
export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  allDay?: boolean;
  status: string;
  eventType?: string;
  transparency?: string;
  myResponseStatus?: string;
  /** Raw API format only — the condensed format folds the self attendee into myResponseStatus. */
  attendees?: GCalEventAttendee[];
  numAttendees?: number;
  recurringEventId?: string;
  htmlLink?: string;
  visibility?: string;
  creator?: { email?: string; displayName?: string; self?: boolean };
  organizer?: { email?: string; displayName?: string; self?: boolean };
  recurrence?: string[];
  hasAttachments?: boolean;
}

export interface GCalAdapterOptions {
  /** Include tentative events as blocking (default: true) */
  includeTentative?: boolean;
  /**
   * Deprecated no-op. Transparent/FYI events now always load, with their
   * transparency carried on the range so conflict detection treats them
   * as free.
   */
  includeTransparent?: boolean;
  /** Fallback label for events with no summary (default: "(busy)") */
  fallbackLabel?: string;
}

/** Microsoft Graph event from the Calendar API. */
export interface MsftGraphEvent {
  id: string;
  iCalUId?: string;
  subject?: string;
  bodyPreview?: string;
  location?: { displayName?: string };
  isAllDay: boolean;
  isCancelled: boolean;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  responseStatus?: {
    response:
      | 'none'
      | 'organizer'
      | 'tentativelyAccepted'
      | 'accepted'
      | 'declined'
      | 'notResponded';
    time?: string;
  };
  attendees?: Array<{
    emailAddress: { name?: string; address?: string };
    type?: 'required' | 'optional' | 'resource';
    status?: { response?: string };
  }>;
  webLink?: string;
  seriesMasterId?: string;
  categories?: string[];
}

export interface MsftAdapterOptions {
  /** Include tentative events as blocking (default: true) */
  includeTentative?: boolean;
  /**
   * Deprecated no-op. Free/workingElsewhere events now always load, with
   * their busy/free signal carried on the range so conflict detection
   * treats them as free.
   */
  includeFree?: boolean;
  /** Fallback label for events with no subject (default: "(busy)") */
  fallbackLabel?: string;
}

export type { DateRange };
