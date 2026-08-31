import { of, throwError } from 'rxjs';

import { HttpService } from '@app/common/http';

import {
  GOOGLE_CALENDAR_EVENTS_FIELDS,
  GOOGLE_CALENDAR_EVENTS_URL,
} from './calendar.constants';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleTokenService } from './google-token.service';

describe('GoogleCalendarService', () => {
  let service: GoogleCalendarService;
  let httpGet: jest.Mock;
  let getAccessToken: jest.Mock;
  let cacheTtlMs: number;

  const configService = {
    get: jest.fn((key: string, def?: number) =>
      key === 'GOOGLE_CALENDAR_CACHE_TTL_MS' ? cacheTtlMs : def,
    ),
  };

  const build = () => {
    const httpService = { get: httpGet } as unknown as HttpService;
    const googleTokenService = {
      getAccessToken,
    } as unknown as GoogleTokenService;
    return new GoogleCalendarService(
      httpService,
      googleTokenService,
      configService as never,
    );
  };

  beforeEach(() => {
    cacheTtlMs = 300000;
    httpGet = jest.fn();
    getAccessToken = jest.fn().mockResolvedValue('token-abc');
    service = build();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps a mocked events.list response to the documented rows', async () => {
    httpGet.mockReturnValueOnce(
      of({
        items: [
          {
            id: 'evt-1',
            summary: 'Team sync',
            start: { dateTime: '2026-01-02T14:00:00+03:00' },
            end: { dateTime: '2026-01-02T15:00:00+03:00' },
            location: 'Office',
            status: 'confirmed',
            eventType: 'default',
            attendees: [
              { responseStatus: 'accepted' },
              { responseStatus: 'needsAction' },
            ],
          },
        ],
      }),
    );

    const result = await service.getEvents(1, 2);

    expect(result).toEqual({
      connected: true,
      rows: ['2026-01-02|14:00|Team sync|Office|2'],
    });
    // the event id never reaches a tool row
    expect(result.rows[0]).not.toContain('evt-1');

    expect(httpGet).toHaveBeenCalledWith(
      GOOGLE_CALENDAR_EVENTS_URL,
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-abc' },
        params: expect.objectContaining({
          timeMin: '2026-01-01T00:00:00.000Z',
          timeMax: '2026-01-03T00:00:00.000Z',
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 20,
          fields: GOOGLE_CALENDAR_EVENTS_FIELDS,
        }),
        timeoutMs: 5000,
      }),
    );
  });

  it('renders all-day events as "all-day" and derives attendeeCount from attendees.length, with no attendee identity in the output', async () => {
    httpGet.mockReturnValueOnce(
      of({
        items: [
          {
            id: 'evt-2',
            summary: 'Company holiday',
            start: { date: '2026-01-05' },
            end: { date: '2026-01-06' },
            status: 'confirmed',
            eventType: 'default',
            attendees: [
              { responseStatus: 'accepted' },
              { responseStatus: 'declined' },
              { responseStatus: 'accepted' },
            ],
          },
        ],
      }),
    );

    const result = await service.getEvents(1, 3);

    expect(result).toEqual({
      connected: true,
      rows: ['2026-01-05|all-day|Company holiday||3'],
    });
    expect(JSON.stringify(result)).not.toMatch(/accepted|declined|needsAction/);
  });

  it('filters cancelled events and the workingLocation/birthday noise event types, keeping outOfOffice', async () => {
    httpGet.mockReturnValueOnce(
      of({
        items: [
          {
            id: 'c1',
            summary: 'Cancelled meeting',
            status: 'cancelled',
            start: { dateTime: '2026-01-02T10:00:00Z' },
            end: { dateTime: '2026-01-02T11:00:00Z' },
          },
          {
            id: 'w1',
            summary: 'Working from home',
            status: 'confirmed',
            eventType: 'workingLocation',
            start: { dateTime: '2026-01-02T09:00:00Z' },
            end: { dateTime: '2026-01-02T17:00:00Z' },
          },
          {
            id: 'b1',
            summary: "Someone's birthday",
            status: 'confirmed',
            eventType: 'birthday',
            start: { date: '2026-01-02' },
            end: { date: '2026-01-03' },
          },
          {
            id: 'o1',
            summary: 'Out of office',
            status: 'confirmed',
            eventType: 'outOfOffice',
            start: { dateTime: '2026-01-02T12:00:00Z' },
            end: { dateTime: '2026-01-02T13:00:00Z' },
          },
        ],
      }),
    );

    const result = await service.getEvents(1, 2);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toContain('Out of office');
  });

  it('short-circuits with no HTTP call when there is no active credential', async () => {
    getAccessToken.mockResolvedValue(null);

    const result = await service.getEvents(1, 2);

    expect(result).toEqual({ connected: false, rows: [] });
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('returns { connected: false } without throwing on an HTTP 5xx', async () => {
    const error = new Error('Internal Server Error') as Error & {
      status: number;
    };
    error.status = 500;
    httpGet.mockReturnValueOnce(throwError(() => error));

    const result = await service.getEvents(10, 2);

    expect(result).toEqual({ connected: false, rows: [] });
  });

  it('returns { connected: false } without throwing on a timeout', async () => {
    httpGet.mockReturnValueOnce(
      throwError(() => new Error('The operation was aborted')),
    );

    const result = await service.getEvents(11, 2);

    expect(result).toEqual({ connected: false, rows: [] });
  });

  it('caches a failure too, so a repeated call inside the TTL does not re-hit Google', async () => {
    httpGet.mockReturnValueOnce(throwError(() => new Error('boom')));

    const first = await service.getEvents(1, 2);
    const second = await service.getEvents(1, 2);

    expect(first).toEqual({ connected: false, rows: [] });
    expect(second).toEqual({ connected: false, rows: [] });
    expect(httpGet).toHaveBeenCalledTimes(1);
  });

  it('serves a second call inside the TTL from cache, and re-fetches once the TTL has elapsed', async () => {
    httpGet.mockReturnValue(of({ items: [] }));

    await service.getEvents(1, 2);
    await service.getEvents(1, 2);

    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(Date.now() + cacheTtlMs + 1));

    await service.getEvents(1, 2);

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it('clamps daysAhead below 1 up to 1', async () => {
    httpGet.mockReturnValueOnce(of({ items: [] }));

    await service.getEvents(1, 0);

    expect(httpGet).toHaveBeenCalledWith(
      GOOGLE_CALENDAR_EVENTS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          timeMax: '2026-01-02T00:00:00.000Z',
        }),
      }),
    );
  });

  it('clamps daysAhead above 7 down to 7', async () => {
    httpGet.mockReturnValueOnce(of({ items: [] }));

    await service.getEvents(1, 30);

    expect(httpGet).toHaveBeenCalledWith(
      GOOGLE_CALENDAR_EVENTS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          timeMax: '2026-01-08T00:00:00.000Z',
        }),
      }),
    );
  });

  it('defaults daysAhead to 2 when omitted', async () => {
    httpGet.mockReturnValueOnce(of({ items: [] }));

    await service.getEvents(1);

    expect(httpGet).toHaveBeenCalledWith(
      GOOGLE_CALENDAR_EVENTS_URL,
      expect.objectContaining({
        params: expect.objectContaining({
          timeMax: '2026-01-03T00:00:00.000Z',
        }),
      }),
    );
  });

  describe('getOccasions', () => {
    it('projects mapped events into { id, title, start, end, allDay, location? } and shares the cache with getEvents', async () => {
      httpGet.mockReturnValueOnce(
        of({
          items: [
            {
              id: 'evt-3',
              summary: 'Dentist',
              start: { dateTime: '2026-01-02T09:00:00Z' },
              end: { dateTime: '2026-01-02T09:30:00Z' },
              location: 'Clinic',
              status: 'confirmed',
              eventType: 'default',
              attendees: [],
            },
          ],
        }),
      );

      const result = await service.getOccasions(1, 2);

      expect(result).toEqual({
        status: 'connected',
        occasions: [
          {
            id: 'evt-3',
            title: 'Dentist',
            start: '2026-01-02T09:00:00Z',
            end: '2026-01-02T09:30:00Z',
            allDay: false,
            location: 'Clinic',
          },
        ],
      });

      // same cache key as getEvents(1, 2): no second HTTP call
      const rows = await service.getEvents(1, 2);
      expect(rows.rows).toEqual(['2026-01-02|09:00|Dentist|Clinic|0']);
      expect(httpGet).toHaveBeenCalledTimes(1);
    });

    it('returns status "disconnected" and an empty array with no active credential', async () => {
      getAccessToken.mockResolvedValue(null);

      const result = await service.getOccasions(1, 2);

      expect(result).toEqual({ status: 'disconnected', occasions: [] });
      expect(httpGet).not.toHaveBeenCalled();
    });
  });
});
