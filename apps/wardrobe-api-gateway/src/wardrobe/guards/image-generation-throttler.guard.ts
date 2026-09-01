import { ExecutionContext, Injectable } from '@nestjs/common';

import { FriendlyThrottlerGuard } from './friendly-throttler.guard';

/**
 * Guards every route that can start a paid image generation: create (with
 * `generate_image`) and retry alike.
 *
 * `ThrottlerGuard`'s default `generateKey` folds in `context.getHandler().name`,
 * so two routes sharing the same `@Throttle(IMAGE_GENERATION_THROTTLE)` object
 * still get *separate* storage buckets — a client alternating between
 * `POST /wardrobe` and `POST /wardrobe/:id/generate-image` doubles its
 * effective rate. Dropping the handler name from the key merges every route
 * that uses this guard into one bucket per tracker (IP), which is what "the
 * same rate limit" is supposed to mean here.
 */
@Injectable()
export class ImageGenerationThrottlerGuard extends FriendlyThrottlerGuard {
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    return `image-generation-${name}-${suffix}`;
  }
}
