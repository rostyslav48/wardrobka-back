/**
 * How long an item may sit `pending` before the sweep gives up on it.
 *
 * A generation takes 10-30s. Anything still pending after this lost its job —
 * the consumer died mid-flight, or the publish never reached the queue — and
 * the user is looking at a spinner that will never resolve. Failing it turns
 * that into a "Generate again" they can act on.
 */
export const IMAGE_GENERATION_STALE_AFTER_MS = 10 * 60 * 1000;

/** How often the sweep runs. Well under the cutoff, cheap (one indexed scan). */
export const IMAGE_GENERATION_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Sent as `code` on the 409 a retry answers with when the retained original is
 * gone (expired by the tmp/ lifecycle rule, or never stored). The client keys
 * its "pick the photo again" path off this rather than off the message text.
 */
export const IMAGE_ORIGINAL_EXPIRED_CODE = 'IMAGE_ORIGINAL_EXPIRED';
