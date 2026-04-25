import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import {
  OutfitLogEntity,
  OutfitLogItemEntity,
} from '@app/common/database/entities/wardrobe';
import {
  CreateOutfitLogRequestDto,
  OutfitLogDto,
  UpdateOutfitLogRequestDto,
} from '@app/wardrobe/dto';

@Injectable()
export class OutfitLogService {
  constructor(
    @InjectRepository(OutfitLogEntity)
    private readonly outfitLogRepository: Repository<OutfitLogEntity>,
    @InjectRepository(OutfitLogItemEntity)
    private readonly outfitLogItemRepository: Repository<OutfitLogItemEntity>,
  ) {}

  async findAll(accountId: number, limit?: number): Promise<OutfitLogDto[]> {
    const logs = await this.outfitLogRepository.find({
      where: { accountId },
      relations: ['items'],
      order: { date: 'DESC' },
      ...(limit ? { take: limit } : {}),
    });

    return plainToInstance(OutfitLogDto, logs.map(this.toDto), {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: string, accountId: number): Promise<OutfitLogDto> {
    const log = await this.outfitLogRepository.findOneOrFail({
      where: { id, accountId },
      relations: ['items'],
    });

    return plainToInstance(OutfitLogDto, this.toDto(log), {
      excludeExtraneousValues: true,
    });
  }

  async create(
    dto: CreateOutfitLogRequestDto,
    accountId: number,
  ): Promise<OutfitLogDto> {
    this.assertNotFutureDate(dto.date);

    const log = this.outfitLogRepository.create({
      accountId,
      date: dto.date,
      notes: dto.notes,
    });

    const savedLog = await this.outfitLogRepository.save(log);
    savedLog.items = await this.replaceItems(savedLog.id, dto.wardrobeItemIds);

    return plainToInstance(OutfitLogDto, this.toDto(savedLog), {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: string,
    dto: UpdateOutfitLogRequestDto,
    accountId: number,
  ): Promise<OutfitLogDto> {
    const log = await this.outfitLogRepository.findOneOrFail({
      where: { id, accountId },
      relations: ['items'],
    });

    if (dto.date !== undefined) {
      this.assertNotFutureDate(dto.date);
      log.date = dto.date;
    }

    if (dto.notes !== undefined) {
      log.notes = dto.notes;
    }

    if (dto.wardrobeItemIds !== undefined) {
      log.items = await this.replaceItems(id, dto.wardrobeItemIds);
    }

    const saved = await this.outfitLogRepository.save(log);

    return plainToInstance(OutfitLogDto, this.toDto(saved), {
      excludeExtraneousValues: true,
    });
  }

  async delete(id: string, accountId: number): Promise<void> {
    await this.outfitLogRepository.findOneByOrFail({ id, accountId });
    await this.outfitLogItemRepository.delete({ outfitLogId: id });
    await this.outfitLogRepository.delete({ id });
  }

  private async replaceItems(
    outfitLogId: string,
    wardrobeItemIds: number[],
  ): Promise<OutfitLogItemEntity[]> {
    await this.outfitLogItemRepository.delete({ outfitLogId });

    if (!wardrobeItemIds.length) {
      return [];
    }

    const items = wardrobeItemIds.map((wardrobeItemId) =>
      this.outfitLogItemRepository.create({ outfitLogId, wardrobeItemId }),
    );

    return this.outfitLogItemRepository.save(items);
  }

  private toDto(log: OutfitLogEntity) {
    return {
      ...log,
      wardrobeItemIds: log.items?.map((i) => i.wardrobeItemId) ?? [],
    };
  }

  private assertNotFutureDate(date: string) {
    if (new Date(date) > new Date()) {
      throw new RpcException({
        message: 'Date cannot be in the future',
        statusCode: 400,
      });
    }
  }
}
