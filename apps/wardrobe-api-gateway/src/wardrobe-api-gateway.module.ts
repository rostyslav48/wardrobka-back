import { Module } from '@nestjs/common';
import { WardrobeApiGatewayController } from './wardrobe-api-gateway.controller';
import { WardrobeApiGatewayService } from './wardrobe-api-gateway.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // validationSchema
      envFilePath: './apps/wardrobe-api-gateway/.env',
    }),
    //     RmqModule.register({
    //       name: BILLING_SERVICE,
    //     }),
  ],
  controllers: [WardrobeApiGatewayController],
  providers: [WardrobeApiGatewayService],
})
export class WardrobeApiGatewayModule {}
