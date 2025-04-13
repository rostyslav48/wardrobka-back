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

  findOne(id: number) {
    return this.wardrobeItemRepository.findOneBy({ id });
  }

  findAll() {
    return this.wardrobeItemRepository.find();
  }

  async create(dto: CreateWardrobeItemDto) {
    const item = this.wardrobeItemRepository.create(dto);
    // TODO fix hardcoded accountId
    item.accountId = 1;

    return await this.entityManager.save(item);
  }

  update(id: number, dto: UpdateWardrobeItemDto) {
    return this.wardrobeItemRepository.update(id, dto);
  }

  delete(id: number) {
    return this.wardrobeItemRepository.delete(id);
  }
}
