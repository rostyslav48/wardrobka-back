import { Controller, Inject, Logger, UseFilters } from '@nestjs/common';
import {
  ClientProxy,
  Ctx,
  EventPattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { firstValueFrom, timeout } from 'rxjs';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { RequestType } from '@app/common/types';
import { GenerateProductImageRequestDto } from '@app/ai-assistant/dto';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';
import { ApplyGeneratedImageOutcome, ImageStatus } from '@app/wardrobe/enums';
import { WardrobeItemDto } from '@app/wardrobe/dto';
import { MediaStorageService } from '@app/wardrobe/media-storage/media-storage.service';
import { WARDROBE_SERVICE } from '@app/wardrobe-api-gateway/constants';

import {
  ProductImageGeneratorService,
  ProductImageGenerationResult,
} from '../services/product-image-generator.service';

// NestJS RMQ `send()` has no default timeout, so a wardrobe service that never
// replies would strand this consumer holding an unacked message forever, with
// nothing in the logs. Bounded so the job fails visibly instead.
const WARDROBE_RPC_TIMEOUT_MS = 15000;

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class ProductImageController {
  private readonly logger = new Logger(ProductImageController.name);

  constructor(
    private readonly productImageGeneratorService: ProductImageGeneratorService,
    private readonly mediaStorageService: MediaStorageService,
    @Inject(WARDROBE_SERVICE)
    private readonly wardrobeClient: ClientProxy,
    private readonly rmqService: RmqService,
  ) {}

  /**
   * Consumes the durable generation event emitted by the wardrobe service.
   *
   * Always acks. An unacked message here is redelivered on every reconnect and
   * each redelivery is a paid image generation, so a message that cannot be
   * processed is dropped with a log rather than left to loop. Retry is the
   * user's "Generate again" on the `failed` state this writes, not a redelivery.
   */
  @EventPattern(AI_ASSISTANT_REQUESTS.generateProductImage)
  async generateProductImage(
    @Ctx() context: RmqContext,
    // Not destructured: the global ValidationPipe skips the generic
    // RequestType<T> envelope (its runtime metatype is Object), and a missing
    // envelope would throw before the handler body could ack.
    @Payload() body: RequestType<GenerateProductImageRequestDto>,
  ): Promise<void> {
    try {
      const request = await this.parseRequest(body?.data);
      if (!request) return;

      if (!(await this.isStillPending(request))) return;

      const result = await this.productImageGeneratorService.generate(request);
      await this.applyResult(request, result);
    } catch (error) {
      this.logger.error(
        `Unhandled error while generating a product image: ${(error as Error).message}`,
      );
    } finally {
      this.rmqService.ack(context);
    }
  }

  private async parseRequest(
    data: GenerateProductImageRequestDto | undefined,
  ): Promise<GenerateProductImageRequestDto | null> {
    const instance = plainToInstance(
      GenerateProductImageRequestDto,
      data ?? {},
    );
    const errors = await validate(instance);

    if (errors.length > 0) {
      this.logger.error(
        'Dropping a malformed product-image job: ' +
          errors
            .flatMap((error) => Object.values(error.constraints ?? {}))
            .join('; '),
      );
      return null;
    }

    return instance;
  }

  /**
   * Redelivery guard. RMQ gives at-least-once delivery, so without this a
   * requeued message would run the (paid) model a second time and replace an
   * image the user is already looking at.
   */
  private async isStillPending(
    request: GenerateProductImageRequestDto,
  ): Promise<boolean> {
    try {
      const item = await firstValueFrom(
        this.wardrobeClient
          .send<WardrobeItemDto>(WARDROBE_REQUESTS.findOne, {
            data: request.itemId,
            user: { id: request.accountId },
          })
          .pipe(timeout(WARDROBE_RPC_TIMEOUT_MS)),
      );

      if (item?.image_status !== ImageStatus.Pending) {
        this.logger.warn(
          `Skipping item ${request.itemId}: image_status is ` +
            `'${item?.image_status}', not 'pending'`,
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Skipping item ${request.itemId}: could not read it back — ` +
          `${(error as Error).message}`,
      );
      return false;
    }
  }

  private async applyResult(
    request: GenerateProductImageRequestDto,
    result: ProductImageGenerationResult,
  ): Promise<void> {
    const outcome = await firstValueFrom(
      this.wardrobeClient
        .send<ApplyGeneratedImageOutcome>(
          WARDROBE_REQUESTS.applyGeneratedImage,
          {
            data: {
              itemId: request.itemId,
              accountId: request.accountId,
              status: result.status,
              imgPath:
                result.status === ImageStatus.Ready
                  ? result.imgPath
                  : undefined,
            },
            user: { id: request.accountId },
          },
        )
        .pipe(timeout(WARDROBE_RPC_TIMEOUT_MS)),
    );

    if (result.status !== ImageStatus.Ready) {
      // The original stays under tmp/ so "Generate again" can re-run from it;
      // the bucket's 7-day rule expires it if that never happens.
      return;
    }

    if (outcome === ApplyGeneratedImageOutcome.NotPending) {
      // A concurrent delivery already finished this item, so the image this
      // job just uploaded is referenced by nothing. The temp original is
      // shared with the winner, though — deleting it here would race that.
      this.logger.warn(
        `Item ${request.itemId} was no longer pending — discarding ${result.imgPath} ` +
          `and leaving ${request.tempImageKey} for whoever did finish it`,
      );
      await this.deleteObject(result.imgPath);
      return;
    }

    if (outcome === ApplyGeneratedImageOutcome.NotFound) {
      // The item was deleted while its job ran, so nothing will ever reference
      // the image just uploaded and no delete path can reach it. Without this
      // it sits in the bucket for the life of the account.
      this.logger.warn(
        `Item ${request.itemId} no longer exists — discarding the generated ` +
          `image ${result.imgPath}`,
      );
      await this.deleteObject(result.imgPath);
    }

    await this.deleteTempOriginal(request.tempImageKey);
  }

  private async deleteTempOriginal(tempImageKey: string): Promise<void> {
    // The item is already `ready` (or gone); a stranded original is a cleanup
    // problem, not a user-visible one, and the lifecycle rule catches it.
    await this.deleteObject(tempImageKey);
  }

  private async deleteObject(key: string): Promise<void> {
    try {
      await this.mediaStorageService.delete(key);
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }
}
