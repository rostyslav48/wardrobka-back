import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import { HttpService } from '@app/common/http';

import {
  CALENDAR_CACHE_MAX_ENTRIES,
  CALENDAR_DAYS_AHEAD_DEFAULT,
  CALENDAR_DAYS_AHEAD_MAX,
  CALENDAR_DAYS_AHEAD_MIN,
  CALENDAR_NOISE_EVENT_TYPES,
  DEFAULT_CALENDAR_CACHE_TTL_MS,
  GOOGLE_CALENDAR_EVENTS_FIELDS,
  GOOGLE_CALENDAR_EVENTS_TIMEOUT_MS,
  GOOGLE_CALENDAR_EVENTS_URL,
  GOOGLE_CALENDAR_MAX_RESULTS,
} from './calendar.constants';
import {
  CalendarEventsResult,
  CalendarOccasion,
  CalendarOccasionsResult,
} from './calendar.types';
import { GoogleTokenService } from './google-token.service';

interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleCalendarEventItem {
  id: string;
  summary?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  location?: string;
  status?: string;
  eventType?: string;
  attendees?: Array<{ responseStatus?: string }>;
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEventItem[];
}

interface MappedEvent {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  location?: string;
  attendeeCount: number;
}

interface CacheEntry {
  events: MappedEvent[] | null;
  expiresAt: number;
}

/**
 * Reads the primary Google calendar through `HttpService`, maps the response
 * into two privacy-scoped projections (tool rows, home-screen occasions) and
 * caches the mapped events in-process per account+daysAhead.
 *
 * The `fields` mask is the privacy boundary: description, organizer, attendee
 * identity, conference data, attachments and recurrence never leave Google in
 * the response body. Nothing here ever logs a summary, a location or a row —
 * only accountId, daysAhead, row count and duration.
 */
@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly googleTokenService: GoogleTokenService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlMs = Number(
      this.configService.get<number>(
        'GOOGLE_CALENDAR_CACHE_TTL_MS',
        DEFAULT_CALENDAR_CACHE_TTL_MS,
      ),
    );
  }

  /** Compact `date|time|summary|location|attendeeCount` rows for the tool loop. The event id never appears here. */
  async getEvents(
    accountId: number,
    daysAhead?: number,
  ): Promise<CalendarEventsResult> {
    const clamped = this.clampDaysAhead(daysAhead);
    const events = await this.fetchMappedEvents(accountId, clamped);

    if (events === null) {
      return { connected: false, rows: [] };
    }

    return { connected: true, rows: events.map((event) => this.toRow(event)) };
  }

  /** The Home screen projection: ids and ISO timestamps, no attendee data. */
  async getOccasions(
    accountId: number,
    daysAhead?: number,
  ): Promise<CalendarOccasionsResult> {
    const clamped = this.clampDaysAhead(daysAhead);
    const events = await this.fetchMappedEvents(accountId, clamped);

    if (events === null) {
      return { status: 'disconnected', occasions: [] };
    }

    return {
      status: 'connected',
      occasions: events.map((event) => this.toOccasion(event)),
    };
  }

  private clampDaysAhead(daysAhead?: number): number {
    if (daysAhead === undefined || !Number.isFinite(daysAhead)) {
      return CALENDAR_DAYS_AHEAD_DEFAULT;
    }
    return Math.min(
      CALENDAR_DAYS_AHEAD_MAX,
      Math.max(CALENDAR_DAYS_AHEAD_MIN, Math.trunc(daysAhead)),
    );
  }

  /**
   * Shared by both projections so they hit the same cache. Returns null for
   * "no active credential" and for any HTTP error or timeout — both are
   * reported to callers as disconnected, and neither ever throws.
   */
  private async fetchMappedEvents(
    accountId: number,
    daysAhead: number,
  ): Promise<MappedEvent[] | null> {
    const cacheKey = `${accountId}:${daysAhead}`;
    const cached = this.readCache(cacheKey);
    if (cached.hit) {
      return cached.events;
    }

    const accessToken = await this.googleTokenService.getAccessToken(accountId);
    if (!accessToken) {
      return null;
    }

    const startedAt = Date.now();

    try {
      const now = new Date();
      const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const response = await firstValueFrom(
        this.httpService.get<GoogleEventsListResponse>(
          GOOGLE_CALENDAR_EVENTS_URL,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              timeMin: now.toISOString(),
              timeMax: timeMax.toISOString(),
              singleEvents: true,
              orderBy: 'startTime',
              maxResults: GOOGLE_CALENDAR_MAX_RESULTS,
              fields: GOOGLE_CALENDAR_EVENTS_FIELDS,
            },
            timeoutMs: GOOGLE_CALENDAR_EVENTS_TIMEOUT_MS,
          },
        ),
      );

      const events = (response?.items ?? [])
        .filter((item) => this.isRelevant(item))
        .map((item) => this.mapEvent(item));

      this.writeCache(cacheKey, events);

      this.logger.log(
        `accountId=${accountId} daysAhead=${daysAhead} rows=${events.length} durationMs=${
          Date.now() - startedAt
        }`,
      );

      return events;
    } catch (error) {
      this.logger.warn(
        `Google Calendar events fetch failed for account ${accountId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Cached too, following WeatherService's precedent: a down or
      // misbehaving Google API should not be re-hit on every call for the
      // rest of the TTL window.
      this.writeCache(cacheKey, null);
      return null;
    }
  }

  private isRelevant(item: GoogleCalendarEventItem): boolean {
    if (item.status === 'cancelled') {
      return false;
    }
    if (item.eventType && CALENDAR_NOISE_EVENT_TYPES.has(item.eventType)) {
      return false;
    }
    return true;
  }

  private mapEvent(item: GoogleCalendarEventItem): MappedEvent {
    const allDay = !!item.start?.date && !item.start?.dateTime;
    const startIso = item.start?.dateTime ?? item.start?.date ?? '';
    const endIso = item.end?.dateTime ?? item.end?.date ?? '';

    return {
      id: item.id,
      title: item.summary ?? '',
      startIso,
      endIso,
      allDay,
      location: item.location,
      attendeeCount: item.attendees?.length ?? 0,
    };
  }

  private toRow(event: MappedEvent): string {
    const date = event.startIso.slice(0, 10);
    const time = event.allDay ? 'all-day' : this.extractTime(event.startIso);

    return [
      date,
      time,
      event.title,
      event.location ?? '',
      String(event.attendeeCount),
    ].join('|');
  }

  private toOccasion(event: MappedEvent): CalendarOccasion {
    return {
      id: event.id,
      title: event.title,
      start: event.startIso,
      end: event.endIso,
      allDay: event.allDay,
      ...(event.location ? { location: event.location } : {}),
    };
  }

  private extractTime(iso: string): string {
    const match = iso.match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
  }

  private readCache(key: string): {
    hit: boolean;
    events: MappedEvent[] | null;
  } {
    const entry = this.cache.get(key);
    if (!entry) {
      return { hit: false, events: null };
    }
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return { hit: false, events: null };
    }
    return { hit: true, events: entry.events };
  }

  private writeCache(key: string, events: MappedEvent[] | null): void {
    if (!this.cache.has(key) && this.cache.size >= CALENDAR_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { events, expiresAt: Date.now() + this.cacheTtlMs });
  }
}
