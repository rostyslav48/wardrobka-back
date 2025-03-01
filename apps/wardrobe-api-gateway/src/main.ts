import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

import { WardrobeApiGatewayModule } from './wardrobe-api-gateway.module';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeApiGatewayModule);
  app.useGlobalPipes(new ValidationPipe());
  const configService = app.get(ConfigService);
  await app.listen(configService.get('PORT'));
}

bootstrap();
