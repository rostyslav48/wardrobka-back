import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { WardrobeService } from '../wardrobe/wardrobe.service';
import { IMAGE_GENERATION_SWEEP_INTERVAL_MS } from '@app/wardrobe/constants';

/**
 * Moves abandoned `pending` items to `failed`.
 *
 * A generation job can disappear without a trace — the consumer dies between
 * reading the message and replying, or the publish never reaches the queue —
 * and nothing else in the system ever revisits that row. The item would keep
 * rendering a spinner with no action attached to it; failing it hands the user
 * a "Generate again" instead.
 */
@Injectable()
export class StaleImageGenerationJob {
  private readonly logger = new Logger(StaleImageGenerationJob.name);

  constructor(private readonly wardrobeService: WardrobeService) {}

  @Interval(IMAGE_GENERATION_SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    try {
      await this.wardrobeService.failStalePendingImages();
    } catch (error) {
      // A sweep that throws would take down the interval with it, so the next
      // tick has to still happen after a transient database error.
      this.logger.error(
        `Stale product-image sweep failed: ${(error as Error).message}`,
      );
    }
  }
}
