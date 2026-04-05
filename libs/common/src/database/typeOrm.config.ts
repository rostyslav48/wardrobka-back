import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';

import { WardrobeItemEntity } from './entities/wardrobe';
import { UserAccountEntity } from './entities/auth';
import {
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
  AssistantWebhookJobEntity,
} from './entities/assistant';

config({ path: './libs/common/src/database/.env' });

const configService = new ConfigService();

export const databaseEntities = [
  UserAccountEntity,
  WardrobeItemEntity,
  AssistantSessionEntity,
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantWebhookJobEntity,
];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.getOrThrow('POSTGRES_HOST'),
  port: configService.getOrThrow('POSTGRES_PORT'),
  database: configService.getOrThrow('POSTGRES_DATABASE'),
  username: configService.getOrThrow('POSTGRES_USER'),
  password: configService.getOrThrow('POSTGRES_PASSWORD'),
  synchronize: configService.getOrThrow('POSTGRES_SYNCHRONIZE'),
  migrations: ['./libs/common/src/database/migrations/*.ts'],
  entities: databaseEntities,
});
