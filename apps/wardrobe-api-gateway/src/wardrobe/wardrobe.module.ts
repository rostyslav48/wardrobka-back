import { Module } from '@nestjs/common';

import { RmqModule } from '@app/common';

import { WardrobeController } from './wardrobe.controller';
import { WardrobeService } from './wardrobe.service';

import { WARDROBE_SERVICE } from '../constants/services';

@Module({
  imports: [
    RmqModule.register({
      name: WARDROBE_SERVICE,
    }),
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}
