import { NestFactory } from '@nestjs/core';
import { WardrobeModule } from './wardrobe.module';

async function bootstrap() {
  const app = await NestFactory.create(WardrobeModule);
  await app.startAllMicroservices();
}

bootstrap();
