import { Controller, Get } from '@nestjs/common';
import { WardrobeApiGatewayService } from './wardrobe-api-gateway.service';

@Controller()
export class WardrobeApiGatewayController {
  constructor(
    private readonly wardrobeApiGatewayService: WardrobeApiGatewayService,
  ) {}

  @Get()
  getHello(): string {
    return this.wardrobeApiGatewayService.getHello();
  }
}
