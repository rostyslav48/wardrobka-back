import { Controller, Get, Logger } from '@nestjs/common';
import { WardrobeService } from './wardrobe.service';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { RmqService } from '@app/common';

@Controller()
export class WardrobeController {
  private readonly logger = new Logger(WardrobeController.name);

  constructor(
    private readonly wardrobeService: WardrobeService,
    private readonly rmqService: RmqService,
  ) {}

  @Get()
  getHello(): string {
    return this.wardrobeService.getHello();
  }

  @EventPattern('wardrobe_hello')
  async handleHello(@Payload() data: any, @Ctx() context: RmqContext) {
    this.logger.log('Data', data);
    this.logger.log('Context');
    this.rmqService.ack(context);
  }
}
