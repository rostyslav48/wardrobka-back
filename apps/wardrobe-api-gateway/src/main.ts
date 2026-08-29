import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { WardrobeApiGatewayModule } from './wardrobe-api-gateway.module';

import { AuthGuard } from './auth/guards';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeApiGatewayModule);

  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get('CORS_ORIGINS')?.split(',') ?? true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const jwtService = app.get(JwtService);
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new AuthGuard(reflector, jwtService));

  await app.listen(configService.get('PORT'));
}

bootstrap();
