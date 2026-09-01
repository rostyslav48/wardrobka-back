export const AI_ASSISTANT_REQUESTS = {
  enqueueChat: 'ai-assistant/chat',
  enqueueOutfitSuggestion: 'ai-assistant/outfit',
  getSessions: 'ai-assistant/get-sessions',
  getSessionMessages: 'ai-assistant/get-session-messages',
  upsertWebhookKey: 'ai-assistant/upsert-webhook-key',
  getRecentSuggestions: 'ai-assistant/get-recent-suggestions',
  getOutfitSuggestions: 'ai-assistant/get-outfit-suggestions',
  deleteOutfitSuggestion: 'ai-assistant/delete-outfit-suggestion',
  analyzeImage: 'ai-assistant/analyze-image',
  // Fire-and-forget event (emit, not send): the item is already saved as
  // `pending` before this is published, so nothing waits on a reply.
  generateProductImage: 'ai-assistant/generate-product-image',
};
