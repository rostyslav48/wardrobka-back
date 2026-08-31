export const CALENDAR_REQUESTS = {
  getAuthUrl: 'calendar/get-auth-url',
  handleCallback: 'calendar/handle-callback',
  getStatus: 'calendar/get-status',
  disconnect: 'calendar/disconnect',
};

/**
 * Where the gateway sends the browser when the callback could not even reach
 * ai-assistant. Kept in sync with the ai-assistant DEFAULT_APP_REDIRECT and
 * with the client's return URL: the callback must never render HTML, so it
 * needs a redirect target that does not depend on a live RMQ round trip.
 */
export const CALENDAR_FALLBACK_APP_REDIRECT =
  'wardrobeassistantfront://calendar-connected';

/**
 * Upper bound on the callback's RMQ round trip. An RMQ `send()` to a queue
 * with no live consumer never errors — it publishes and waits for a reply that
 * never comes — so without this the gateway would hold the browser open
 * instead of redirecting, and the fallback above would be unreachable.
 *
 * Sized above ai-assistant's own 10000 ms Google token timeout so a slow but
 * working exchange still wins the race and reports its real outcome.
 */
export const CALENDAR_CALLBACK_TIMEOUT_MS = 15000;
