import { Controller, Get } from '@nestjs/common';
import { WardrobeService } from './wardrobe.service';

@Controller()
export class WardrobeController {
  constructor(private readonly wardrobeService: WardrobeService) {}

  @Get()
  getHello(): string {
    return this.wardrobeService.getHello();
  }
}
