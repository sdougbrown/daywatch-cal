import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TOOLS, handleToolCall } from '../src/server.js';
import { CalendarSession } from '../src/state.js';

const ICS_TEXT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//test//EN',
  'BEGIN:VEVENT',
  'UID:shift-1',
  'DTSTART;VALUE=DATE:20260615',
  'DTEND;VALUE=DATE:20260622',
  'SUMMARY:Alice On-Call',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const FEED_WINDOW = { window_from: '2026-06-01', window_to: '2026-06-30' };

function getTextContent(result: CallToolResult): string {
  const entry = result.content.find((item) => item.type === 'text');
  if (!entry) {
    throw new Error('Expected text content in tool result.');
  }

  return entry.text;
}

function parseJsonContent<T>(result: CallToolResult): T {
  return JSON.parse(getTextContent(result)) as T;
}

function icsResponse(
  body: BodyInit | null,
  init: ResponseInit & { contentType?: string } = {},
): Response {
  const { contentType, ...responseInit } = init;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType ?? 'text/calendar; charset=utf-8' },
    ...responseInit,
  });
}

function stubFetch(...responses: Array<Response | Error>): ReturnType<typeof vi.fn> {
  const mock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      mock.mockRejectedValueOnce(response);
    } else {
      mock.mockResolvedValueOnce(response);
    }
  }

  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('load_calendar_url', () => {
  it('is registered in the tool list', () => {
    const tool = TOOLS.find((candidate) => candidate.name === 'load_calendar_url');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(['url']);
  });

  it('fetches an https feed and loads it into the session', async () => {
    const fetchMock = stubFetch(icsResponse(ICS_TEXT));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.incident.io/v2/schedule_feeds/feed.ics',
      id: 'rotation',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseJsonContent<{
      calendars_loaded: number;
      ranges_loaded: number;
      calendar_id: string;
      sample_labels: string[];
    }>(result);
    expect(parsed.calendars_loaded).toBe(1);
    expect(parsed.ranges_loaded).toBe(1);
    expect(parsed.calendar_id).toBe('rotation');
    expect(parsed.sample_labels).toEqual(['Alice On-Call']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.href).toBe('https://rota.incident.io/v2/schedule_feeds/feed.ics');
    expect(init.redirect).toBe('manual');
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/^daywatch-mcp\//);
  });

  it('rewrites webcal URLs to https before fetching', async () => {
    const fetchMock = stubFetch(icsResponse(ICS_TEXT));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'webcal://rota.example.com/feed.ics',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    const [requestUrl] = fetchMock.mock.calls[0] as [URL];
    expect(requestUrl.href).toBe('https://rota.example.com/feed.ics');
  });

  it('rewrites webcal URLs with surrounding whitespace', async () => {
    const fetchMock = stubFetch(icsResponse(ICS_TEXT));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: ' webcal://rota.example.com/feed.ics ',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    expect((fetchMock.mock.calls[0][0] as URL).href).toBe('https://rota.example.com/feed.ics');
  });

  it('loads a feed using the default parse window when none is given', async () => {
    const now = new Date();
    const fmtIcs = (date: Date) =>
      `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
    const ics = ICS_TEXT.replace(
      'DTSTART;VALUE=DATE:20260615',
      `DTSTART;VALUE=DATE:${fmtIcs(start)}`,
    ).replace('DTEND;VALUE=DATE:20260622', `DTEND;VALUE=DATE:${fmtIcs(end)}`);
    stubFetch(icsResponse(ics));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBeUndefined();
    const parsed = parseJsonContent<{
      ranges_loaded: number;
      effective_window: { from: string; to: string };
    }>(result);
    expect(parsed.ranges_loaded).toBe(1);

    const fmtIso = (date: Date) =>
      [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-');
    // The detected-window fallback only pads the event dates by ±1 month, so an
    // effective window reaching past today+5mo proves the default (now−1mo …
    // now+6mo) parse window was applied.
    expect(parsed.effective_window.from <= fmtIso(now)).toBe(true);
    expect(
      parsed.effective_window.to >=
        fmtIso(new Date(now.getFullYear(), now.getMonth() + 5, now.getDate())),
    ).toBe(true);
  });

  it('refuses plain http for non-loopback hosts without fetching', async () => {
    const fetchMock = stubFetch();
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'http://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('localhost');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://localhost:8080/feed.ics',
    'http://127.0.0.1/feed.ics',
    'http://[::1]:8080/feed.ics',
  ])('allows plain http for loopback host %s', async (url) => {
    stubFetch(icsResponse(ICS_TEXT));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', { url, ...FEED_WINDOW });

    expect(result.isError).toBeUndefined();
  });

  it('refuses non-http schemes', async () => {
    const fetchMock = stubFetch();
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'file:///etc/passwd',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('https');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects strings that are not URLs', async () => {
    stubFetch();
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', { url: 'not a url' });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('not a valid URL');
  });

  it('requires window_from and window_to together', async () => {
    stubFetch();
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
      window_from: '2026-06-01',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('"window_from" and "window_to"');
  });

  it('reports non-2xx responses with the token redacted and an auth hint', async () => {
    stubFetch(icsResponse('denied', { status: 403 }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.incident.io/v2/schedule_feeds/supersecrettoken12345.ics?token=alsosecret',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('HTTP 403');
    expect(message).toContain('auth token');
    expect(message).not.toContain('supersecrettoken12345');
    expect(message).not.toContain('alsosecret');
  });

  it('adds the auth hint for HTTP 401', async () => {
    stubFetch(icsResponse('unauthorized', { status: 401 }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('HTTP 401');
    expect(message).toContain('auth token');
  });

  it('omits the auth hint for non-auth failures like HTTP 404', async () => {
    stubFetch(icsResponse('missing', { status: 404 }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('HTTP 404');
    expect(message).not.toContain('auth token');
  });

  it('follows redirects to allowed URLs, including relative Locations', async () => {
    const fetchMock = stubFetch(
      new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.com/feeds/rotation.ics' },
      }),
      new Response(null, { status: 301, headers: { location: '/feeds/v2/rotation.ics' } }),
      icsResponse(ICS_TEXT),
    );
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent<{ ranges_loaded: number }>(result).ranges_loaded).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const hops = fetchMock.mock.calls.map(([requestUrl]) => (requestUrl as URL).href);
    expect(hops).toEqual([
      'https://rota.example.com/feed.ics',
      'https://cdn.example.com/feeds/rotation.ics',
      'https://cdn.example.com/feeds/v2/rotation.ics',
    ]);
  });

  it('refuses redirects to URLs the scheme/host policy disallows', async () => {
    const fetchMock = stubFetch(
      new Response(null, {
        status: 302,
        headers: { location: 'http://10.0.0.2/admin' },
      }),
    );
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.incident.io/v2/schedule_feeds/supersecrettoken12345.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('disallowed');
    expect(message).toContain('localhost');
    expect(message).not.toContain('supersecrettoken12345');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after too many redirects', async () => {
    const redirect = () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://rota.example.com/feed.ics' },
      });
    const fetchMock = stubFetch(
      redirect(),
      redirect(),
      redirect(),
      redirect(),
      redirect(),
      redirect(),
    );
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('redirects');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('errors on a redirect without a Location header', async () => {
    stubFetch(new Response(null, { status: 301 }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('without a Location header');
  });

  it('applies the timezone parameter to the session', async () => {
    stubFetch(icsResponse(ICS_TEXT));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
      timezone: 'America/Chicago',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    expect(session.timezone).toBe('America/Chicago');
  });

  it('treats an empty 200 response as an explicit error', async () => {
    stubFetch(icsResponse(''));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('0 bytes');
  });

  it('treats a 200 response with no body as 0 bytes', async () => {
    stubFetch(new Response(null, { status: 200 }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('0 bytes');
  });

  it('flags HTML responses as a likely login or web page', async () => {
    stubFetch(
      icsResponse('<!DOCTYPE html><html><body>Sign in</body></html>', {
        contentType: 'text/html',
      }),
    );
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('HTML');
    expect(message).toContain('text/html');
  });

  it('flags HTML responses that start with <html> rather than a doctype', async () => {
    stubFetch(icsResponse('<html><body>Sign in</body></html>', { contentType: 'text/html' }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('HTML');
  });

  it('rejects bodies that are not iCalendar data', async () => {
    stubFetch(icsResponse('{"events": []}', { contentType: 'application/json' }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('BEGIN:VCALENDAR');
  });

  it('accepts feeds served with a generic content type when the body is iCalendar', async () => {
    stubFetch(icsResponse(ICS_TEXT, { contentType: 'application/octet-stream' }));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
      ...FEED_WINDOW,
    });

    expect(result.isError).toBeUndefined();
    expect(parseJsonContent<{ ranges_loaded: number }>(result).ranges_loaded).toBe(1);
  });

  it('surfaces timeouts distinctly', async () => {
    stubFetch(new DOMException('The operation timed out.', 'TimeoutError'));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('timed out');
  });

  it('surfaces AbortError the same way as a timeout', async () => {
    stubFetch(new DOMException('This operation was aborted.', 'AbortError'));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('timed out');
  });

  it('surfaces a timeout that fires while the body is downloading', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR'));
        controller.error(new DOMException('The operation timed out.', 'TimeoutError'));
      },
    });
    stubFetch(icsResponse(stream));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('timed out');
  });

  it('keeps the token redacted when the connection drops mid-download', async () => {
    const streamError = new TypeError('terminated');
    (streamError as { cause?: unknown }).cause = Object.assign(new Error('other side closed'), {
      code: 'UND_ERR_SOCKET',
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR'));
        controller.error(streamError);
      },
    });
    stubFetch(icsResponse(stream));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.incident.io/v2/schedule_feeds/supersecrettoken12345.ics?token=alsosecret',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('Connection failed while downloading');
    expect(message).toContain('UND_ERR_SOCKET');
    expect(message).not.toContain('supersecrettoken12345');
    expect(message).not.toContain('alsosecret');
  });

  it('falls back to the cause message when the cause has no code, keeping the token redacted', async () => {
    const networkError = new TypeError('fetch failed');
    (networkError as { cause?: unknown }).cause = new Error('unexpected TLS alert');
    stubFetch(networkError);
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.incident.io/v2/schedule_feeds/supersecrettoken12345.ics?token=alsosecret',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('Could not reach');
    expect(message).toContain('unexpected TLS alert');
    expect(message).not.toContain('supersecrettoken12345');
    expect(message).not.toContain('alsosecret');
  });

  it('falls back to the error message when there is no cause', async () => {
    stubFetch(new TypeError('Network request failed'));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('Could not reach');
    expect(message).toContain('Network request failed');
  });

  it('surfaces network failures with the undici cause code', async () => {
    const networkError = new TypeError('fetch failed');
    (networkError as { cause?: unknown }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND rota.example.com'),
      { code: 'ENOTFOUND' },
    );
    stubFetch(networkError);
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    const message = getTextContent(result);
    expect(message).toContain('Could not reach');
    expect(message).toContain('ENOTFOUND');
  });

  it('enforces the feed size cap while streaming', async () => {
    const megabyte = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 21; index += 1) {
          controller.enqueue(megabyte);
        }
        controller.close();
      },
    });
    stubFetch(icsResponse(stream));
    const session = new CalendarSession('UTC');

    const result = await handleToolCall(session, 'load_calendar_url', {
      url: 'https://rota.example.com/feed.ics',
    });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('size limit');
  });
});
