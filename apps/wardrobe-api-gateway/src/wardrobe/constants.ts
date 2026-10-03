// DI token for the ai-assistant RMQ client used by the analyze-image endpoint.
// Scoped to WardrobeModule — separate from the generic CLIENT_PROXY_SERVICE
// token, which this module already binds to the wardrobe client.
export const AI_ASSISTANT_CLIENT_PROXY_SERVICE =
  'AI_ASSISTANT_CLIENT_PROXY_SERVICE';

/**
 * Throttle applied to every route that can start a (paid) image generation:
 * the create endpoint and the retry endpoint alike. One object rather than two
 * decorators with the same numbers, so they cannot drift apart.
 */
export const IMAGE_GENERATION_THROTTLE = {
  default: { ttl: 5000, limit: 1 },
};

/**
 * Throttle for the analyze-image endpoint. Looser than generation: analysis
 * fires automatically every time the add-item form gets a new photo, so a
 * user picking a couple of candidate photos in quick succession must not be
 * mistaken for abuse. Still bounded — 3 calls per 10s is enough for normal
 * picking, not enough to make repeated analysis calls a free-form loop.
 */
export const ANALYZE_IMAGE_THROTTLE = {
  default: { ttl: 10000, limit: 3 },
};
