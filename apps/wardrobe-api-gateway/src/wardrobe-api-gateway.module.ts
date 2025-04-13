import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

import { WardrobeModule } from './wardrobe/wardrobe.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
      }),
      envFilePath: './apps/wardrobe-api-gateway/.env',
    }),

    WardrobeModule,
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class WardrobeApiGatewayModule {}
