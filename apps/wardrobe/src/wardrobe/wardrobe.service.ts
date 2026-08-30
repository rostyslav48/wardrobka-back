import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
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
import { WARDROBE_PREVIEW_SELECT } from '@app/wardrobe/constants';

@Injectable()
export class WardrobeService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(WardrobeItemEntity)
    private readonly wardrobeItemRepository: Repository<WardrobeItemEntity>,
    @InjectRepository(OutfitLogItemEntity)
    private readonly outfitLogItemRepository: Repository<OutfitLogItemEntity>,
    private readonly mediaStorageService: MediaStorageService,
    private readonly configService: ConfigService,
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
  ): Promise<WardrobeItemDto> {
    const item = this.wardrobeItemRepository.create(dto);

    item.accountId = accountId;
    if (image) {
      item.img_path = await this.mediaStorageService.store(
        image,
        `${this.configService.getOrThrow('USER_IMAGES_FOLDER_PATH')}/${accountId}`,
      );
    }

    const savedEntity = await this.entityManager.save(item);
    const [itemWithUrl] = await this.getItemsWithImageUrls([savedEntity]);

    return plainToInstance(WardrobeItemDto, itemWithUrl, {
      excludeExtraneousValues: true,
    });
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

    Object.assign(item, dto);
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
