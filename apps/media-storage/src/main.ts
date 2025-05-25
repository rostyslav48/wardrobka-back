import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { MediaStorageModule } from './media-storage.module';

import { RmqService } from '@app/common';

import { MEDIA_STORAGE_SERVICE } from '@app/wardrobe-api-gateway/constants';

async function bootstrap() {
  const app = await NestFactory.create(MediaStorageModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions(MEDIA_STORAGE_SERVICE));
  app.useGlobalPipes(new ValidationPipe());
  await app.startAllMicroservices();
}

bootstrap();
