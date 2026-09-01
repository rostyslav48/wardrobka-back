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
