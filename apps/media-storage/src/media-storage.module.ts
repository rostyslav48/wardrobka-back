import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { ErrorLoggerModule } from '@app/logger';

import { MediaStorageController } from './media-storage.controller';

import { MediaStorageService } from './media-storage.service';

@Module({
  imports: [
    RmqModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_MEDIA_STORAGE_QUEUE: Joi.string(),
        RABBIT_MQ_LOGGER_QUEUE: Joi.string(),
        ERROR_LOG_MIN_SEVERITY: Joi.string()
          .valid('warn', 'error', 'fatal')
          .optional(),
        AWS_ACCESS_KEY_ID: Joi.string(),
        AWS_SECRET_ACCESS_KEY: Joi.string(),
        AWS_S3_REGION: Joi.string(),
      }),
      envFilePath: ['./apps/media-storage/.env', './.env'],
    }),
    // Must stay AFTER ConfigModule.forRoot — see wardrobe.module.ts for why.
    ErrorLoggerModule.register({ serviceName: 'media-storage' }),
  ],
  controllers: [MediaStorageController],
  providers: [MediaStorageService],
})
export class MediaStorageModule {}
