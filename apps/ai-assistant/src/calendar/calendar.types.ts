export type CalendarStatus = 'disconnected' | 'active' | 'revoked';

export type CalendarCallbackStatus = 'ok' | 'denied' | 'scope_denied' | 'error';

export interface CalendarStatusResponse {
  status: CalendarStatus;
}

export interface CalendarAuthUrlResponse {
  url: string;
}

/** The gateway 302s to this; it never renders anything itself. */
export interface CalendarCallbackResponse {
  redirectUrl: string;
  status: CalendarCallbackStatus;
}

export interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/** The compact row format handed to the tool loop. Never carries the event id. */
export interface CalendarEventsResult {
  connected: boolean;
  rows: string[];
}

export interface CalendarOccasion {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

export interface CalendarOccasionsResult {
  status: 'connected' | 'disconnected';
  occasions: CalendarOccasion[];
}

export interface GetOccasionsRequest {
  daysAhead?: number;
}
