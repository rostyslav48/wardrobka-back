import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { ConfiguredJwtModule } from '@app/common/jwt/configured-jwt.module';
import { WardrobeModule } from './wardrobe/wardrobe.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
      }),
      envFilePath: [
        './apps/wardrobe-api-gateway/.env',
        './libs/common/src/jwt/.env',
      ],
    }),
    ConfiguredJwtModule,
    WardrobeModule,
    AuthModule,
  ],
  controllers: [],
})
export class WardrobeApiGatewayModule {}
