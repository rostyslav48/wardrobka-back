import { NestFactory } from '@nestjs/core';

import { RmqService } from '@app/common';

import { WardrobeModule } from './wardrobe.module';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions('WARDROBE'));
  await app.startAllMicroservices();
}

bootstrap();
