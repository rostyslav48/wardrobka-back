import type { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

/**
 * The columns `WardrobeService.findAll` loads for a `WardrobeItemPreviewDto`.
 *
 * Lives here rather than inline in the service because consumers of the
 * `findMany` RPC (the AI assistant's `search_wardrobe` tool and its seed
 * summary) read fields off the preview and silently get `undefined` for
 * anything missing from this list. Specs pin the fields they read against this
 * constant so the two cannot drift apart again.
 */
export const WARDROBE_PREVIEW_SELECT: (keyof WardrobeItemEntity)[] = [
  'id',
  'name',
  'img_path',
  'favourite',
  'type',
  'color',
  'season',
  'size',
  'status',
  'image_status',
];
