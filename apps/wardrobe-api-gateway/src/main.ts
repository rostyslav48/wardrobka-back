import { NestFactory } from '@nestjs/core';
import { WardrobeApiGatewayModule } from './wardrobe-api-gateway.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeApiGatewayModule);
  const configSerivce = app.get(ConfigService);
  await app.listen(configSerivce.get('PORT'));
}

bootstrap();
