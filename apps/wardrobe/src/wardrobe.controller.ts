import { Controller } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';
import { RmqService } from '@app/common';

import { WardrobeService } from './wardrobe.service';

@Controller()
export class WardrobeController {
  constructor(
    private readonly wardrobeService: WardrobeService,
    private readonly rmqService: RmqService,
  ) {}

  // @EventPattern('wardrobe_hello')
  // async handleHello(@Payload() data: any, @Ctx() context: RmqContext) {
  //   this.logger.log('Data', data);
  //   this.logger.log('Context');
  //   this.rmqService.ack(context);
  // }

  @MessagePattern('wardrobe/get_items')
  findAll(@Ctx() context: RmqContext) {
    this.rmqService.ack(context);
    return this.wardrobeService.findAll();
  }
}
