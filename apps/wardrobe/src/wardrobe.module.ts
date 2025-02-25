import { Module } from '@nestjs/common';
import { WardrobeController } from './wardrobe.controller';
import { WardrobeService } from './wardrobe.service';
import { ConfigModule } from '@nestjs/config';
import { RmqModule } from '@app/common';
import * as Joi from 'joi';

@Module({
  imports: [
    RmqModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_WARDROBE_QUEUE: Joi.string(),
      }),
      envFilePath: './apps/auth/.env',
    }),
  ],
  controllers: [WardrobeController],
  providers: [WardrobeService],
})
export class WardrobeModule {}
