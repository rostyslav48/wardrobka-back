/**
 * S3 key prefix for originals held only until their generation job finishes.
 *
 * Single source of truth: the wardrobe service uploads under it, the
 * ai-assistant generator reads and deletes from it, and `S3DiskUtil` installs
 * the bucket lifecycle rule that expires whatever either of them leaves behind.
 */
export const TEMP_UPLOAD_PREFIX = 'tmp';

/** Days after which the lifecycle rule expires an orphaned temp original. */
export const TEMP_UPLOAD_EXPIRY_DAYS = 7;

/** Stable rule id, so re-installing it replaces rather than duplicates. */
export const TEMP_UPLOAD_LIFECYCLE_RULE_ID = 'wardrobe-tmp-originals-expire-7d';
