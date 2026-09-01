import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { WardrobeModule } from './wardrobe.module';

import { RmqService } from '@app/common';

import { WARDROBE_SERVICE } from '@app/wardrobe-api-gateway/constants';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions(WARDROBE_SERVICE));
  app.useGlobalPipes(new ValidationPipe());
  await app.startAllMicroservices();
  // `connectMicroservice` marks the microservice as already initialized and
  // its init hook as already called, so `startAllMicroservices()` alone runs
  // no lifecycle hook. Without this @nestjs/schedule never registers its
  // timers and the stale product-image sweep is dead code.
  await app.init();
}

bootstrap();
