import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { RmqModule } from '@app/common';
import { ConfiguredJwtModule } from '@app/common/jwt/configured-jwt.module';
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
      }),
      envFilePath: [
        './apps/auth/.env',
        './libs/common/src/database/.env',
        './libs/common/src/jwt/.env',
      ],
    }),
    UsersModule,
    ConfiguredJwtModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, BcryptService],
  exports: [AuthService],
})
export class AuthModule {}
