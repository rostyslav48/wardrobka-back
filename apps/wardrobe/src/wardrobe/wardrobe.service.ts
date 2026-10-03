import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { basename } from 'path';

import {
  OutfitLogItemEntity,
  WardrobeItemEntity,
} from '@app/common/database/entities/wardrobe';

import { MediaStorageService } from '../media-storage/media-storage.service';

import {
  CreateWardrobeItemRequestDto,
  FindManyWardrobeItemsRequestDto,
  UpdateWardrobeItemRequestDto,
  WardrobeItemDto,
  WardrobeItemPreviewDto,
} from '@app/wardrobe/dto';

import { FileTransfer } from '@app/media-storage/models';
import { TEMP_UPLOAD_PREFIX } from '@app/media-storage/constants';
import {
  IMAGE_GENERATION_STALE_AFTER_MS,
  IMAGE_ORIGINAL_EXPIRED_CODE,
  WARDROBE_PREVIEW_SELECT,
} from '@app/wardrobe/constants';
import { ApplyGeneratedImageOutcome, ImageStatus } from '@app/wardrobe/enums';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { AI_ASSISTANT_SERVICE } from '@app/wardrobe-api-gateway/constants';
import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class WardrobeService {
  private readonly logger = new Logger(WardrobeService.name);

  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(WardrobeItemEntity)
    private readonly wardrobeItemRepository: Repository<WardrobeItemEntity>,
    @InjectRepository(OutfitLogItemEntity)
    private readonly outfitLogItemRepository: Repository<OutfitLogItemEntity>,
    private readonly mediaStorageService: MediaStorageService,
    private readonly configService: ConfigService,
    @Inject(AI_ASSISTANT_SERVICE)
    private readonly aiAssistantClient: ClientProxy,
  ) {}

  public async findOne(
    id: number,
    accountId: number,
  ): Promise<WardrobeItemDto> {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id,
      accountId,
    });

    const [itemWithUrl] = await this.getItemsWithImageUrls([item]);

    return plainToInstance(WardrobeItemDto, itemWithUrl, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(
    accountId: number,
    filters: FindManyWardrobeItemsRequestDto,
  ): Promise<WardrobeItemPreviewDto[]> {
    const itemsPreview = await this.wardrobeItemRepository.find({
      where: { accountId, ...filters },
      select: WARDROBE_PREVIEW_SELECT,
    });

    const entitiesWithPath = await this.getItemsWithImageUrls(itemsPreview);
    return plainToInstance(WardrobeItemPreviewDto, entitiesWithPath, {
      excludeExtraneousValues: true,
    });
  }

  async create(
    dto: CreateWardrobeItemRequestDto,
    accountId: number,
    image?: FileTransfer,
    user?: UserAccountPreview,
  ): Promise<WardrobeItemDto> {
    // `generate_image` is a transport flag, not a column — keep it off the
    // entity even though TypeORM's create() would drop it anyway.
    const { generate_image: generateImage, ...itemFields } = dto;
    const item = this.wardrobeItemRepository.create(itemFields);

    item.accountId = accountId;

    // With generation on, the uploaded photo is the *input* to the job, not the
    // item's image: it goes to the tmp/ prefix, img_path stays empty until the
    // generated image lands, and the client renders a placeholder meanwhile.
    const shouldGenerate = Boolean(generateImage && image);
    let tempImageKey: string | undefined;

    if (image) {
      tempImageKey = shouldGenerate
        ? await this.mediaStorageService.store(
            image,
            `${TEMP_UPLOAD_PREFIX}/${accountId}`,
          )
        : undefined;

      if (!shouldGenerate) {
        item.img_path = await this.mediaStorageService.store(
          image,
          `${this.configService.getOrThrow('USER_IMAGES_FOLDER_PATH')}/${accountId}`,
        );
      }
    }

    item.image_status = shouldGenerate
      ? ImageStatus.Pending
      : ImageStatus.Ready;
    // Retained until the generated image lands: it is both the job's input and
    // what "Generate again" re-runs from after a failure.
    item.temp_image_key = shouldGenerate ? tempImageKey : null;
    item.image_pending_since = shouldGenerate ? new Date() : null;

    const savedEntity = await this.entityManager.save(item);

    if (shouldGenerate) {
      this.emitGenerationRequest(
        savedEntity.id,
        accountId,
        tempImageKey,
        image.originalname,
        user,
      );
    }

    const [itemWithUrl] = await this.getItemsWithImageUrls([savedEntity]);

    return plainToInstance(WardrobeItemDto, itemWithUrl, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Fire-and-forget: the item is already saved as `pending`, so a publish
   * failure must not fail the save the user is waiting on. It leaves the item
   * pending with its original still under tmp/ — recoverable by Phase 3's
   * retry, and swept by the bucket's 7-day rule if it never is.
   */
  private emitGenerationRequest(
    itemId: number,
    accountId: number,
    tempImageKey: string,
    originalName: string,
    user?: UserAccountPreview,
  ): void {
    this.aiAssistantClient
      .emit(AI_ASSISTANT_REQUESTS.generateProductImage, {
        data: { itemId, accountId, tempImageKey, originalName },
        user: user ?? null,
      })
      .subscribe({
        complete: () =>
          this.logger.log(
            `Published a product-image job for item ${itemId} (${tempImageKey})`,
          ),
        error: (error: Error) =>
          this.logger.error(
            `Failed to publish a product-image job for item ${itemId}: ${error.message}`,
          ),
      });
  }

  /**
   * Terminal step of a generation job. Guarded on `image_status = 'pending'`
   * so a redelivered RMQ message cannot overwrite an already-ready item.
   *
   * A read-then-write (`findOneBy` then `save`) leaves a window where two
   * deliveries of the same job — arriving within the same few milliseconds —
   * both observe `pending` and both save, orphaning one of the two generated
   * objects. The UPDATE below is the guard: it carries `WHERE image_status =
   * 'pending'` in the same statement that flips it, so Postgres serialises
   * concurrent attempts on the row and only one can ever match. The `old` CTE
   * captures the pre-update `img_path` in that same atomic statement, since
   * `RETURNING` alone only ever exposes the post-update row.
   *
   * The outcome tells the caller which cleanup it owns: only `applied` means
   * the files this job produced belong to this item, and only `not_found`
   * means the generated object has no owner left at all.
   */
  async applyGeneratedImage(
    itemId: number,
    accountId: number,
    status: ImageStatus.Ready | ImageStatus.Failed,
    imgPath?: string,
  ): Promise<ApplyGeneratedImageOutcome> {
    const rows: Array<{
      previous_img_path: string | null;
      new_img_path: string | null;
    }> = await this.entityManager.query(
      `WITH old AS (
         SELECT img_path FROM wardrobe_item
         WHERE id = $1 AND account_id = $2 AND image_status = 'pending'
       )
       UPDATE wardrobe_item
       SET image_status = $3::text,
           image_pending_since = NULL,
           img_path = CASE
             WHEN $3::text = 'ready' AND $4::text IS NOT NULL THEN $4::text
             ELSE img_path
           END,
           temp_image_key = CASE WHEN $3::text = 'ready' THEN NULL ELSE temp_image_key END
       WHERE id = $1 AND account_id = $2 AND image_status = 'pending'
       RETURNING (SELECT img_path FROM old) AS previous_img_path, img_path AS new_img_path`,
      [itemId, accountId, status, imgPath ?? null],
    );

    if (rows.length === 0) {
      // The atomic UPDATE already lost the race (or never had a row to win);
      // this lookup is only to word the log correctly, never to decide the write.
      const stillExists = await this.wardrobeItemRepository.exists({
        where: { id: itemId, accountId },
      });

      if (!stillExists) {
        this.logger.warn(
          `Generated image for item ${itemId} has no matching item — dropping it`,
        );
        return ApplyGeneratedImageOutcome.NotFound;
      }

      this.logger.warn(
        `Item ${itemId} was not 'pending' — ignoring a duplicate '${status}' result`,
      );
      return ApplyGeneratedImageOutcome.NotPending;
    }

    const { previous_img_path: previousImgPath, new_img_path: newImgPath } =
      rows[0];

    // Steady state is one image per item: if anything was already stored under
    // the item, the generated one replaces it rather than joining it.
    if (previousImgPath && previousImgPath !== newImgPath) {
      await this.mediaStorageService.delete(previousImgPath);
    }

    return ApplyGeneratedImageOutcome.Applied;
  }

  /**
   * "Generate again" — re-runs the job from the original the item still holds
   * under tmp/, so the user does not have to find the photo again.
   *
   * Answers 409 rather than queueing a job that is certain to fail when the
   * original is gone (expired by the 7-day rule, or never stored because the
   * item was created without generation); the client turns that specific
   * `code` into a "pick the photo again" flow.
   */
  async retryImageGeneration(
    itemId: number,
    accountId: number,
    user?: UserAccountPreview,
  ): Promise<WardrobeItemDto> {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id: itemId,
      accountId,
    });

    if (item.image_status === ImageStatus.Pending) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'This image is already being generated.',
        code: 'IMAGE_ALREADY_PENDING',
      });
    }

    if (!item.temp_image_key || !(await this.hasTempOriginal(item))) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          'The photo this item was created from is no longer available. ' +
          'Pick the photo again to generate a new image.',
        code: IMAGE_ORIGINAL_EXPIRED_CODE,
      });
    }

    item.image_status = ImageStatus.Pending;
    item.image_pending_since = new Date();
    const savedEntity = await this.wardrobeItemRepository.save(item);

    this.emitGenerationRequest(
      savedEntity.id,
      accountId,
      savedEntity.temp_image_key,
      basename(savedEntity.temp_image_key),
      user,
    );

    const [itemWithUrl] = await this.getItemsWithImageUrls([savedEntity]);

    return plainToInstance(WardrobeItemDto, itemWithUrl, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * A storage error is not an answer: reporting it as "gone" would send the
   * user off to re-pick a photo that is still sitting in the bucket, so it
   * counts as present and the retry proceeds (and fails visibly if it must).
   */
  private async hasTempOriginal(item: WardrobeItemEntity): Promise<boolean> {
    try {
      return await this.mediaStorageService.exists(item.temp_image_key);
    } catch (error) {
      this.logger.warn(
        `Could not check the retained original for item ${item.id} ` +
          `(${item.temp_image_key}): ${(error as Error).message}`,
      );
      return true;
    }
  }

  /**
   * Fails items whose job never came back. Without this a consumer that died
   * mid-flight — or a publish that never reached the queue — leaves the user
   * watching a spinner with no action attached to it, forever.
   *
   * The original stays under tmp/, so every item this touches is retryable
   * until the bucket's 7-day rule expires it.
   */
  async failStalePendingImages(
    staleAfterMs: number = IMAGE_GENERATION_STALE_AFTER_MS,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs);

    const { affected } = await this.wardrobeItemRepository.update(
      {
        image_status: ImageStatus.Pending,
        image_pending_since: LessThan(cutoff),
      },
      { image_status: ImageStatus.Failed, image_pending_since: null },
    );

    if (affected) {
      this.logger.warn(
        `Failed ${affected} item(s) whose product-image job never finished ` +
          `(pending since before ${cutoff.toISOString()})`,
      );
    }

    return affected ?? 0;
  }

  async findManyByIds(
    ids: number[],
    accountId: number,
  ): Promise<WardrobeItemDto[]> {
    if (!ids?.length) {
      return [];
    }

    const items = await this.wardrobeItemRepository.find({
      where: {
        id: In(ids),
        accountId,
      },
    });

    if (!items.length) {
      return [];
    }

    const enriched = await this.getItemsWithImageUrls(items);
    return plainToInstance(WardrobeItemDto, enriched, {
      excludeExtraneousValues: true,
    });
  }

  private async getItemsWithImageUrls(
    items: WardrobeItemEntity[],
  ): Promise<(WardrobeItemEntity & { img_path?: string })[]> {
    const itemPaths = items.map((item) => ({
      id: item.id,
      path: item.img_path,
    }));

    const itemUrls = await this.mediaStorageService.getUrls(
      itemPaths.filter(({ path }) => !!path),
    );

    return items.map((item) => ({
      ...item,
      img_url: itemUrls[item.id] ?? null,
    }));
  }

  async update(
    id: number,
    dto: UpdateWardrobeItemRequestDto,
    accountId: number,
    image?: FileTransfer,
    user?: UserAccountPreview,
  ): Promise<WardrobeItemDto> {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id,
      accountId,
    });

    // Same transport-only flag as on create — never assigned onto the entity.
    const { generate_image: generateImage, ...itemFields } = dto;

    // A new photo with generation on is the fallback path for an item whose
    // retained original expired: same pipeline as create, except the existing
    // image stays visible until the generated one replaces it.
    const shouldGenerate = Boolean(generateImage && image);

    if (image) {
      await this.replaceStoredImage(item, accountId, image, shouldGenerate);
    }

    Object.assign(item, itemFields);
    const updatedItem = await this.wardrobeItemRepository.save(item);

    if (shouldGenerate) {
      this.emitGenerationRequest(
        updatedItem.id,
        accountId,
        updatedItem.temp_image_key,
        image.originalname,
        user,
      );
    }

    const [itemWithUrl] = plainToInstance(
      WardrobeItemDto,
      await this.getItemsWithImageUrls([updatedItem]),
      {
        excludeExtraneousValues: true,
      },
    );

    return itemWithUrl;
  }

  /**
   * Stores a replacement photo, either as the item's image or as the input to
   * a fresh generation job.
   *
   * Any original still held under tmp/ is dropped either way: once the user has
   * supplied a new photo, the old one is not what "Generate again" should use.
   */
  private async replaceStoredImage(
    item: WardrobeItemEntity,
    accountId: number,
    image: FileTransfer,
    shouldGenerate: boolean,
  ): Promise<void> {
    const previousTempKey = item.temp_image_key;

    if (shouldGenerate) {
      item.temp_image_key = await this.mediaStorageService.store(
        image,
        `${TEMP_UPLOAD_PREFIX}/${accountId}`,
      );
      item.image_status = ImageStatus.Pending;
      item.image_pending_since = new Date();
    } else {
      if (item.img_path) {
        await this.mediaStorageService.delete(item.img_path);
      }

      item.img_path = await this.mediaStorageService.store(
        image,
        `${this.configService.getOrThrow('USER_IMAGES_FOLDER_PATH')}/${accountId}`,
      );
      // The uploaded photo *is* the item's image now, so any earlier
      // generation failure is no longer the item's state.
      item.image_status = ImageStatus.Ready;
      item.temp_image_key = null;
      item.image_pending_since = null;
    }

    if (previousTempKey) {
      await this.deleteQuietly(previousTempKey);
    }
  }

  private async deleteQuietly(filePath: string): Promise<void> {
    try {
      await this.mediaStorageService.delete(filePath);
    } catch (error) {
      // Storage cleanup must never fail the user's write; the tmp/ lifecycle
      // rule catches whatever is left behind.
      this.logger.warn(
        `Could not delete ${filePath}: ${(error as Error).message}`,
      );
    }
  }

  async delete(id: number, accountId: number) {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id,
      accountId,
    });

    if (item.img_path) {
      await this.mediaStorageService.delete(item.img_path);
    }

    // A failed item's original is still sitting under tmp/ waiting for a retry
    // that can no longer happen.
    if (item.temp_image_key) {
      await this.deleteQuietly(item.temp_image_key);
    }

    // Outfit-log entries have no DB-level FK to wardrobe items (cross-service
    // tables), so the join rows must be cleaned up explicitly or they keep
    // pointing at a deleted item — see BUG-011.
    await this.outfitLogItemRepository.delete({ wardrobeItemId: id });

    return this.wardrobeItemRepository.delete({ id, accountId });
  }
}
