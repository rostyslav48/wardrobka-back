import { Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe';

import { CreateWardrobeItemDto } from './dto/create-wardrobe-item.dto';
import { UpdateWardrobeItemDto } from './dto/update-wardrobe-item.dto';

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

  findAll(accountId: number) {
    return this.wardrobeItemRepository.find({ where: { accountId } });
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
