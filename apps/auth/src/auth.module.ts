import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { ConfiguredJwtModule } from '@app/common/jwt/configured-jwt.module';
import { ErrorLoggerModule } from '@app/logger';
import { UsersModule } from './users/users.module';

import { AuthController } from './auth/auth.controller';

import { AuthService } from './auth/auth.service';
import { BcryptService } from './auth/services/bcrypt.service';

@Module({
  imports: [
    RmqModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string(),
        RABBIT_MQ_AUTH_QUEUE: Joi.string(),
        RABBIT_MQ_LOGGER_QUEUE: Joi.string(),
        ERROR_LOG_MIN_SEVERITY: Joi.string()
          .valid('warn', 'error', 'fatal')
          .optional(),
      }),
      envFilePath: [
        './apps/auth/.env',
        './libs/common/src/database/.env',
        './libs/common/src/jwt/.env',
      ],
    }),
    // Must stay AFTER ConfigModule.forRoot — see wardrobe.module.ts for why.
    ErrorLoggerModule.register({ serviceName: 'auth' }),
    UsersModule,
    ConfiguredJwtModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, BcryptService],
  exports: [AuthService],
})
export class AuthModule {}
