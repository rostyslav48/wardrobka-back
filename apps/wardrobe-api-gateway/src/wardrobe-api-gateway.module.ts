import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';

import { ConfiguredJwtModule } from '@app/common/jwt/configured-jwt.module';
import { WardrobeModule } from './wardrobe/wardrobe.module';
import { AuthModule } from './auth/auth.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { OutfitLogModule } from './outfit-log/outfit-log.module';

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
        './apps/media-storage/.env',
      ],
    }),
    // Registered exactly once: ThrottlerModule is @Global(), so every
    // ThrottlerModule.forRoot() call anywhere in the module tree overwrites
    // the previous one — the last registration silently wins for every route
    // guarded by a bare ThrottlerGuard. Per-route policies are expressed with
    // @Throttle({ default: { ttl, limit } }) against this single 'default'
    // throttler.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 30 }],
    }),
    ConfiguredJwtModule,
    WardrobeModule,
    AuthModule,
    AiAssistantModule,
    OutfitLogModule,
  ],
  controllers: [],
})
export class WardrobeApiGatewayModule {}
