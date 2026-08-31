import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { EntityManager, In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

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
import { WARDROBE_PREVIEW_SELECT } from '@app/wardrobe/constants';
import { ImageStatus } from '@app/wardrobe/enums';
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

    item.image_status = shouldGenerate ? ImageStatus.Pending : ImageStatus.Ready;

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
   * so a redelivered RMQ message cannot overwrite an already-ready item (and
   * so returns false, telling the caller not to delete anything).
   */
  async applyGeneratedImage(
    itemId: number,
    accountId: number,
    status: ImageStatus.Ready | ImageStatus.Failed,
    imgPath?: string,
  ): Promise<boolean> {
    const item = await this.wardrobeItemRepository.findOneBy({
      id: itemId,
      accountId,
    });

    if (!item) {
      this.logger.warn(
        `Generated image for item ${itemId} has no matching item — dropping it`,
      );
      return false;
    }

    if (item.image_status !== ImageStatus.Pending) {
      this.logger.warn(
        `Item ${itemId} is already '${item.image_status}' — ignoring a ` +
          `duplicate '${status}' result`,
      );
      return false;
    }

    const previousImgPath = item.img_path;

    item.image_status = status;
    if (status === ImageStatus.Ready && imgPath) {
      item.img_path = imgPath;
    }

    await this.wardrobeItemRepository.save(item);

    // Steady state is one image per item: if anything was already stored under
    // the item, the generated one replaces it rather than joining it.
    if (previousImgPath && previousImgPath !== item.img_path) {
      await this.mediaStorageService.delete(previousImgPath);
    }

    return true;
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
  ): Promise<WardrobeItemDto> {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id,
      accountId,
    });

    if (image) {
      if (item.img_path) {
        await this.mediaStorageService.delete(item.img_path);
      }

      item.img_path = await this.mediaStorageService.store(
        image,
        `${this.configService.getOrThrow('USER_IMAGES_FOLDER_PATH')}/${accountId}`,
      );
    }

    // Same transport-only flag as on create — never assigned onto the entity.
    const { generate_image: _generateImage, ...itemFields } = dto;
    Object.assign(item, itemFields);
    const updatedItem = await this.wardrobeItemRepository.save(item);

    const [itemWithUrl] = plainToInstance(
      WardrobeItemDto,
      await this.getItemsWithImageUrls([updatedItem]),
      {
        excludeExtraneousValues: true,
      },
    );

    return itemWithUrl;
  }

  async delete(id: number, accountId: number) {
    const item = await this.wardrobeItemRepository.findOneByOrFail({
      id,
      accountId,
    });

    if (item.img_path) {
      await this.mediaStorageService.delete(item.img_path);
    }

    // Outfit-log entries have no DB-level FK to wardrobe items (cross-service
    // tables), so the join rows must be cleaned up explicitly or they keep
    // pointing at a deleted item — see BUG-011.
    await this.outfitLogItemRepository.delete({ wardrobeItemId: id });

    return this.wardrobeItemRepository.delete({ id, accountId });
  }
}
