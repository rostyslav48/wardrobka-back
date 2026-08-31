export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/**
 * Read-only access to events on the calendars the user already owns. The
 * broader calendar.readonly would additionally grant the calendar list, ACLs
 * and settings, none of which is ever read.
 */
export const GOOGLE_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.events.readonly';

/** Token exchange and revoke both talk to accounts.google.com. */
export const GOOGLE_TOKEN_TIMEOUT_MS = 10000;

/**
 * Domain separation for the HMAC: a signature minted here can never be
 * mistaken for one minted by any other feature sharing PROTECTED_DATA_SECRET.
 */
export const STATE_PREFIX = 'gcal-state:';
export const STATE_TTL_MS = 10 * 60 * 1000;

/** Refresh this far before the real expiry, to absorb clock skew and latency. */
export const ACCESS_TOKEN_SKEW_MS = 60 * 1000;

/**
 * Fallback for GOOGLE_OAUTH_APP_REDIRECT. Every GOOGLE_* variable is optional,
 * so the callback must still have somewhere to send the browser when the
 * integration was never configured. Must match the client's return URL.
 */
export const DEFAULT_APP_REDIRECT =
  'wardrobeassistantfront://calendar-connected';
