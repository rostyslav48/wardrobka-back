import { Module } from '@nestjs/common';
import { WardrobeApiGatewayController } from './wardrobe-api-gateway.controller';
import { WardrobeApiGatewayService } from './wardrobe-api-gateway.service';
import { ConfigModule } from '@nestjs/config';
import { WardrobeModule } from './wardrobe/wardrobe.module';
import * as Joi from 'joi';
import { RmqModule } from '@app/common';
import { WARDROBE_SERVICE } from './constants/services';

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
    RmqModule.register({
      name: WARDROBE_SERVICE,
    }),
  ],
  controllers: [WardrobeApiGatewayController],
  providers: [WardrobeApiGatewayService],
})
export class WardrobeApiGatewayModule {}
