import { NestFactory } from '@nestjs/core';
import { WardrobeApiGatewayModule } from './wardrobe-api-gateway.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeApiGatewayModule);
  app.useGlobalPipes(new ValidationPipe());
  const configService = app.get(ConfigService);
  await app.listen(configService.get('PORT'));
}

bootstrap();
