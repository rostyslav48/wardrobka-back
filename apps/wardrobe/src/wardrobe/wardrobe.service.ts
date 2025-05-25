import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

import { MediaStorageService } from '../media-storage/media-storage.service';

import {
  FindManyWardrobeItemsRequestDto,
  UpdateWardrobeItemRequestDto,
  CreateWardrobeItemRequestDto,
  WardrobeItemPreviewDto,
  WardrobeItemDto,
} from '@app/wardrobe/dto';

import { FileTransfer } from '@app/media-storage/models';

@Injectable()
export class WardrobeService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(WardrobeItemEntity)
    private readonly wardrobeItemRepository: Repository<WardrobeItemEntity>,
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
      select: [
        'id',
        'name',
        'img_path',
        'favourite',
        'type',
        'color',
        'season',
        'size',
      ],
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

    return this.wardrobeItemRepository.delete({ id, accountId });
  }
}
