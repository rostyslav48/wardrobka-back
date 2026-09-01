import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { DatabaseModule } from '@app/common';
import { MediaStorageModule } from './media-storage/media-storage.module';

import { AI_ASSISTANT_SERVICE } from '@app/wardrobe-api-gateway/constants';

import { WardrobeController } from './wardrobe/wardrobe.controller';
import { WardrobeService } from './wardrobe/wardrobe.service';
import { OutfitLogController } from './outfit-log/outfit-log.controller';
import { OutfitLogService } from './outfit-log/outfit-log.service';

import { WardrobeItemEntity } from '@app/common/database/entities/wardrobe/wardrobe-item.entity';
import { OutfitLogEntity } from '@app/common/database/entities/wardrobe/outfit-log.entity';
import { OutfitLogItemEntity } from '@app/common/database/entities/wardrobe/outfit-log-item.entity';
import { UserAccountEntity } from '@app/common/database/entities/auth/user-account.entity';

@Module({
  imports: [
    RmqModule,
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_WARDROBE_QUEUE: Joi.string(),
        RABBIT_MQ_AI_ASSISTANT_QUEUE: Joi.string(),
        USER_IMAGES_FOLDER_PATH: Joi.string(),
      }),
      envFilePath: ['./apps/wardrobe/.env', './libs/common/src/database/.env'],
    }),
    // Client for the product-image generation event, emitted (not sent) from
    // WardrobeService.create — see plan-09 Phase 2.
    //
    // Must stay AFTER ConfigModule.forRoot: modules of equal rank instantiate
    // in import order, and ClientsModule.registerAsync's factory reads
    // RABBIT_MQ_AI_ASSISTANT_QUEUE through ConfigService at that moment. Listed
    // earlier it reads undefined and Nest silently falls back to the queue
    // named 'default', where the job sits forever with nothing consuming it.
    RmqModule.register({ name: AI_ASSISTANT_SERVICE }),
    TypeOrmModule.forFeature([
      UserAccountEntity,
      WardrobeItemEntity,
      OutfitLogEntity,
      OutfitLogItemEntity,
    ]),
    MediaStorageModule,
  ],
  controllers: [WardrobeController, OutfitLogController],
  providers: [WardrobeService, OutfitLogService],
})
export class WardrobeModule {}
