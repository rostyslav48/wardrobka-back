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
