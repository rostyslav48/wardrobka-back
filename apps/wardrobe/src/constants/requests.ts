export const WARDROBE_REQUESTS = {
  findMany: 'wardrobe/get_items',
  findOne: 'wardrobe/get_item',
  create: 'wardrobe/create',
  update: 'wardrobe/update',
  delete: 'wardrobe/delete',
  findManyByIds: 'wardrobe/get_many_by_ids',
  applyGeneratedImage: 'wardrobe/apply_generated_image',
  retryImageGeneration: 'wardrobe/retry_image_generation',
};

export const OUTFIT_LOG_REQUESTS = {
  findMany: 'outfit_log/find_many',
  findOne: 'outfit_log/find_one',
  create: 'outfit_log/create',
  update: 'outfit_log/update',
  delete: 'outfit_log/delete',
};
