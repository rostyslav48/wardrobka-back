import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { DatabaseModule } from '@app/common';

import { WardrobeController } from './wardrobe.controller';
import { WardrobeService } from './wardrobe.service';

@Module({
  imports: [
    RmqModule,
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_WARDROBE_QUEUE: Joi.string(),
      }),
      envFilePath: './apps/wardrobe/.env',
    }),
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}
