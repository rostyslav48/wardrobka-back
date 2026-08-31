import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { ConfigService } from '@nestjs/config';

import {
  WardrobeItemEntity,
  OutfitLogEntity,
  OutfitLogItemEntity,
} from './entities/wardrobe';
import { UserAccountEntity } from './entities/auth';
import {
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
  AssistantWebhookJobEntity,
} from './entities/assistant';
import { ErrorLogEntity } from './entities/logger';
import { GoogleCalendarCredentialEntity } from './entities/calendar';

config({ path: './libs/common/src/database/.env' });

const configService = new ConfigService();

export const databaseEntities = [
  UserAccountEntity,
  WardrobeItemEntity,
  OutfitLogEntity,
  OutfitLogItemEntity,
  AssistantSessionEntity,
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantWebhookJobEntity,
  ErrorLogEntity,
  GoogleCalendarCredentialEntity,
];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.getOrThrow('POSTGRES_HOST'),
  port: configService.getOrThrow('POSTGRES_PORT'),
  database: configService.getOrThrow('POSTGRES_DATABASE'),
  username: configService.getOrThrow('POSTGRES_USER'),
  password: configService.getOrThrow('POSTGRES_PASSWORD'),
  // See dtabase.module.ts — POSTGRES_SYNCHRONIZE is a raw env string and
  // must be compared explicitly, or the string 'false' evaluates truthy.
  synchronize: configService.getOrThrow('POSTGRES_SYNCHRONIZE') === 'true',
  migrations: ['./libs/common/src/database/migrations/*.ts'],
  entities: databaseEntities,
});
