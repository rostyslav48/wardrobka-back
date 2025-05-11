import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

import {
  FindManyWardrobeItemsDto,
  UpdateWardrobeItemDto,
  CreateWardrobeItemDto,
} from '@app/wardrobe/dto';

@Injectable()
export class WardrobeService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(WardrobeItemEntity)
    private wardrobeItemRepository: Repository<WardrobeItemEntity>,
  ) {}

  findOne(id: number, accountId: number) {
    return this.wardrobeItemRepository.findOneByOrFail({ id, accountId });
  }

  findAll(accountId: number, filters: FindManyWardrobeItemsDto) {
    return this.wardrobeItemRepository.find({
      where: { accountId, ...filters },
    });
  }

  async create(dto: CreateWardrobeItemDto, accountId: number) {
    const item = this.wardrobeItemRepository.create(dto);
    item.accountId = accountId;

    return await this.entityManager.save(item);
  }

  update(id: number, dto: UpdateWardrobeItemDto, accountId: number) {
    return this.wardrobeItemRepository.update({ id, accountId }, dto);
  }

  delete(id: number, accountId: number) {
    return this.wardrobeItemRepository.delete({ id, accountId });
  }
}
