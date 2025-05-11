import { NestFactory } from '@nestjs/core';

import { AuthModule } from './auth.module';

import { RmqService } from '@app/common';

import { AUTH_SERVICE } from '@app/wardrobe-api-gateway/constants';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions(AUTH_SERVICE));
  await app.startAllMicroservices();
}

bootstrap();
