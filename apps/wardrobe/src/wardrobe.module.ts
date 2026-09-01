import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { DatabaseModule } from '@app/common';
import { ErrorLoggerModule } from '@app/logger';
import { MediaStorageModule } from './media-storage/media-storage.module';

import { AI_ASSISTANT_SERVICE } from '@app/wardrobe-api-gateway/constants';

import { WardrobeController } from './wardrobe/wardrobe.controller';
import { WardrobeService } from './wardrobe/wardrobe.service';
import { OutfitLogController } from './outfit-log/outfit-log.controller';
import { OutfitLogService } from './outfit-log/outfit-log.service';
import { StaleImageGenerationJob } from './jobs/stale-image-generation.job';

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
        RABBIT_MQ_LOGGER_QUEUE: Joi.string(),
        ERROR_LOG_MIN_SEVERITY: Joi.string()
          .valid('warn', 'error', 'fatal')
          .optional(),
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
    // Same ordering requirement as above: ErrorLoggerModule.register()
    // internally does RmqModule.register({ name: LOGGER_SERVICE }), which
    // reads RABBIT_MQ_LOGGER_QUEUE through ConfigService at construction time.
    ErrorLoggerModule.register({ serviceName: 'wardrobe' }),
    TypeOrmModule.forFeature([
      UserAccountEntity,
      WardrobeItemEntity,
      OutfitLogEntity,
      OutfitLogItemEntity,
    ]),
    MediaStorageModule,
    // Drives the stale product-image sweep. Its hooks fire on
    // onApplicationBootstrap, which a microservice-only bootstrap skips — see
    // the `app.init()` call in main.ts.
    ScheduleModule.forRoot(),
  ],
  controllers: [WardrobeController, OutfitLogController],
  providers: [WardrobeService, OutfitLogService, StaleImageGenerationJob],
})
export class WardrobeModule {}
