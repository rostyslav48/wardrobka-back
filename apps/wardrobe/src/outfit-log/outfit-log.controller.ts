import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { RequestType } from '@app/common/types';
import { OUTFIT_LOG_REQUESTS } from '@app/wardrobe/constants';
import {
  CreateOutfitLogRequestDto,
  OutfitLogDto,
  UpdateOutfitLogRequestDto,
} from '@app/wardrobe/dto';

import { OutfitLogService } from './outfit-log.service';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class OutfitLogController {
  constructor(
    private readonly outfitLogService: OutfitLogService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(OUTFIT_LOG_REQUESTS.findMany)
  async findAll(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<{ limit?: number }>,
  ): Promise<OutfitLogDto[]> {
    const logs = await this.outfitLogService.findAll(user.id, data?.limit);
    this.rmqService.ack(context);

    return logs;
  }

  @MessagePattern(OUTFIT_LOG_REQUESTS.findOne)
  async findOne(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<string>,
  ): Promise<OutfitLogDto> {
    const log = await this.outfitLogService.findOne(data, user.id);
    this.rmqService.ack(context);

    return log;
  }

  @MessagePattern(OUTFIT_LOG_REQUESTS.create)
  async create(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<CreateOutfitLogRequestDto>,
  ): Promise<OutfitLogDto> {
    const log = await this.outfitLogService.create(data, user.id);
    this.rmqService.ack(context);

    return log;
  }

  @MessagePattern(OUTFIT_LOG_REQUESTS.update)
  async update(
    @Ctx() context: RmqContext,
    @Body()
    { user, data }: RequestType<{ id: string; dto: UpdateOutfitLogRequestDto }>,
  ): Promise<OutfitLogDto> {
    const log = await this.outfitLogService.update(data.id, data.dto, user.id);
    this.rmqService.ack(context);

    return log;
  }

  @MessagePattern(OUTFIT_LOG_REQUESTS.delete)
  async delete(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<string>,
  ): Promise<void> {
    await this.outfitLogService.delete(data, user.id);
    this.rmqService.ack(context);
  }
}
