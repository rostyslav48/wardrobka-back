import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';

import {
  OutfitLogEntity,
  OutfitLogItemEntity,
  WardrobeItemEntity,
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
    @InjectRepository(WardrobeItemEntity)
    private readonly wardrobeItemRepository: Repository<WardrobeItemEntity>,
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
    savedLog.items = await this.replaceItems(
      savedLog.id,
      dto.wardrobeItemIds,
      accountId,
    );

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
      log.items = await this.replaceItems(id, dto.wardrobeItemIds, accountId);
    }

    const saved = await this.outfitLogRepository.save(log);

    return plainToInstance(OutfitLogDto, this.toDto(saved), {
      excludeExtraneousValues: true,
    });
  }

  async delete(
    id: string,
    accountId: number,
  ): Promise<{ success: true }> {
    await this.outfitLogRepository.findOneByOrFail({ id, accountId });
    await this.outfitLogItemRepository.delete({ outfitLogId: id });
    await this.outfitLogRepository.delete({ id });

    // The RMQ response observable must emit something — a handler that
    // resolves void/undefined completes the client's observable with no
    // emission, and Nest's lastValueFrom throws EmptyError — see BUG-012.
    return { success: true };
  }

  private async replaceItems(
    outfitLogId: string,
    wardrobeItemIds: number[],
    accountId: number,
  ): Promise<OutfitLogItemEntity[]> {
    await this.outfitLogItemRepository.delete({ outfitLogId });

    if (!wardrobeItemIds.length) {
      return [];
    }

    const owned = await this.wardrobeItemRepository.find({
      where: { id: In(wardrobeItemIds), accountId },
    });
    const ownedIds = new Set(owned.map((item) => item.id));
    const foreignIds = wardrobeItemIds.filter((id) => !ownedIds.has(id));

    if (foreignIds.length) {
      throw new RpcException({
        message: `wardrobeItemIds must reference items you own: ${foreignIds.join(', ')}`,
        statusCode: 400,
      });
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

  private assertNotFutureDate(date: number) {
    if (date > Date.now()) {
      throw new RpcException({
        message: 'Date cannot be in the future',
        statusCode: 400,
      });
    }
  }
}
