import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { WardrobeApiGatewayModule } from './wardrobe-api-gateway.module';

import { AuthGuard } from './auth/guards';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeApiGatewayModule);
  app.useGlobalPipes(new ValidationPipe());

  const jwtService = app.get(JwtService);
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new AuthGuard(reflector, jwtService));

  const configService = app.get(ConfigService);
  await app.listen(configService.get('PORT'));
}

bootstrap();
