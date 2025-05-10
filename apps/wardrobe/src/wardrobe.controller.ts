import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { WardrobeService } from './wardrobe.service';

import { CreateWardrobeItemDto } from './dto/create-wardrobe-item.dto';
import { UpdateWardrobeItemDto } from './dto/update-wardrobe-item.dto';

import { WARDROBE_REQUESTS } from '@app/wardrobe/constants';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class WardrobeController {
  constructor(
    private readonly wardrobeService: WardrobeService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(WARDROBE_REQUESTS.findOne)
  findOne(@Ctx() context: RmqContext, @Body() id: number) {
    const item = this.wardrobeService.findOne(id);
    this.rmqService.ack(context);

    return item;
  }

  @MessagePattern(WARDROBE_REQUESTS.findMany)
  async findMany(@Ctx() context: RmqContext) {
    const items = await this.wardrobeService.findAll();
    this.rmqService.ack(context);

    return items;
  }

  @MessagePattern(WARDROBE_REQUESTS.create)
  async create(
    @Ctx() context: RmqContext,
    @Body() request: CreateWardrobeItemDto,
  ) {
    const item = await this.wardrobeService.create(request);
    this.rmqService.ack(context);

    return item;
  }

  @MessagePattern(WARDROBE_REQUESTS.update)
  async update(
    @Ctx() context: RmqContext,
    @Body() request: { id: number; dto: UpdateWardrobeItemDto },
  ) {
    const updatedItem = await this.wardrobeService.update(
      request.id,
      request.dto,
    );
    this.rmqService.ack(context);

    return updatedItem;
  }

  @MessagePattern(WARDROBE_REQUESTS.delete)
  async delete(@Body() id: number, @Ctx() context: RmqContext) {
    const deletedItem = await this.wardrobeService.delete(id);
    this.rmqService.ack(context);

    return deletedItem;
  }
}
