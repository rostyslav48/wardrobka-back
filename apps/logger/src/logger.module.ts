import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';

import { DatabaseModule, RmqModule } from '@app/common';
import { ErrorLogEntity } from '@app/common/database/entities/logger';

import { ErrorLogController } from './error-log.controller';
import { ErrorLogService } from './error-log.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['./apps/logger/.env', './libs/common/src/database/.env'],
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string().uri().required(),
        RABBIT_MQ_LOGGER_QUEUE: Joi.string().required(),
      }),
    }),
    RmqModule,
    DatabaseModule,
    TypeOrmModule.forFeature([ErrorLogEntity]),
  ],
  controllers: [ErrorLogController],
  providers: [ErrorLogService],
})
export class LoggerModule {}
