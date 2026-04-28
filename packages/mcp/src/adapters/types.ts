import type { DateRange } from '@daywatch/cal';

/** Google Calendar event as returned by gcal_list_events (condensed format). */
export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  allDay: boolean;
  status: string;
  eventType?: string;
  transparency?: string;
  myResponseStatus?: string;
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
  /** Include transparent/FYI events (default: false) */
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
  /** Include free/workingElsewhere events (default: false) */
  includeFree?: boolean;
  /** Fallback label for events with no subject (default: "(busy)") */
  fallbackLabel?: string;
}

export type { DateRange };
