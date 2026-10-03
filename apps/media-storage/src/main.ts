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
  // `connectMicroservice` marks the microservice as already initialized and
  // its init hook as already called, so `startAllMicroservices()` alone never
  // runs any lifecycle hook. Without this the service's OnModuleInit — which
  // installs the tmp/ retention rule on the bucket — is dead code.
  await app.init();
}

bootstrap();
