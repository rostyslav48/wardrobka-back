// DI token for the ai-assistant RMQ client used by the analyze-image endpoint.
// Scoped to WardrobeModule — separate from the generic CLIENT_PROXY_SERVICE
// token, which this module already binds to the wardrobe client.
export const AI_ASSISTANT_CLIENT_PROXY_SERVICE =
  'AI_ASSISTANT_CLIENT_PROXY_SERVICE';
