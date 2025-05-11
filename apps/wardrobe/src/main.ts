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
}

bootstrap();
