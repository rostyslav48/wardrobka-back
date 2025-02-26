import { Module } from '@nestjs/common';
import { WardrobeService } from './wardrobe.service';
import { WardrobeController } from './wardrobe.controller';

@Module({
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}
