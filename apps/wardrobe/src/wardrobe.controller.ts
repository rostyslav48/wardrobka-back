import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { WardrobeService } from './wardrobe.service';

import { RequestType } from '@app/common/types';

import {
  CreateWardrobeItemDto,
  UpdateWardrobeItemDto,
  FindManyWardrobeItemsDto,
} from '@app/wardrobe/dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class WardrobeController {
  constructor(
    private readonly wardrobeService: WardrobeService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(WARDROBE_REQUESTS.findOne)
  findOne(
    @Ctx() context: RmqContext,
    @Body() { data, user }: RequestType<number>,
  ) {
    const item = this.wardrobeService.findOne(data, user.id);
    this.rmqService.ack(context);

    return item;
  }

  @MessagePattern(WARDROBE_REQUESTS.findMany)
  async findMany(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<FindManyWardrobeItemsDto>,
  ) {
    const items = await this.wardrobeService.findAll(user.id, data);
    this.rmqService.ack(context);

    return items;
  }

  @MessagePattern(WARDROBE_REQUESTS.create)
  async create(
    @Ctx() context: RmqContext,
    @Body() { data, user }: RequestType<CreateWardrobeItemDto>,
  ) {
    const item = await this.wardrobeService.create(data, user.id);
    this.rmqService.ack(context);

    return item;
  }

  @MessagePattern(WARDROBE_REQUESTS.update)
  async update(
    @Ctx() context: RmqContext,
    @Body()
    { data, user }: RequestType<{ id: number; dto: UpdateWardrobeItemDto }>,
  ) {
    const updatedItem = await this.wardrobeService.update(
      data.id,
      data.dto,
      user.id,
    );
    this.rmqService.ack(context);

    return updatedItem;
  }

  @MessagePattern(WARDROBE_REQUESTS.delete)
  async delete(
    @Ctx() context: RmqContext,
    @Body() { data, user }: RequestType<number>,
  ) {
    const deletedItem = await this.wardrobeService.delete(data, user.id);
    this.rmqService.ack(context);

    return deletedItem;
  }
}
