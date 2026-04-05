import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';

import { AiAssistantModule } from './ai-assistant.module';
import { RmqService } from '@app/common';
import { AI_ASSISTANT_SERVICE } from '@app/wardrobe-api-gateway/constants';

async function bootstrap() {
  const app = await NestFactory.create(AiAssistantModule);
  const rmqService = app.get<RmqService>(RmqService);
  app.connectMicroservice(rmqService.getOptions(AI_ASSISTANT_SERVICE));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.startAllMicroservices();
}

bootstrap();
