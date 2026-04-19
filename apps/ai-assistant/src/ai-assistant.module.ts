import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';

import { DatabaseModule, RmqModule } from '@app/common';
import { HttpService } from '@app/common/http';
import { AssistantMessageEntity, AssistantOutfitSuggestionEntity, AssistantSessionEntity, AssistantWebhookJobEntity } from '@app/common/database/entities/assistant';
import { UserAccountEntity } from '@app/common/database/entities/auth';
import { MEDIA_STORAGE_SERVICE, WARDROBE_SERVICE } from '@app/wardrobe-api-gateway/constants';

import { AiAssistantController } from './controllers/ai-assistant.controller';
import { ConversationService } from './services/conversation.service';
import { GeminiClientService } from './services/gemini-client.service';
import { ContextBuilderService } from './services/context-builder.service';
import { WeatherService } from './services/weather.service';
import { WebhookQueueService } from './services/webhook-queue.service';
import { WebhookDispatcherJob } from './jobs/webhook-dispatcher.job';
import { WebhookHttpService } from './webhook/webhook-http.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        './apps/ai-assistant/.env',
        './libs/common/src/database/.env',
      ],
      validationSchema: Joi.object({
        RABBIT_MQ_URI: Joi.string().uri().required(),
        RABBIT_MQ_AI_ASSISTANT_QUEUE: Joi.string().required(),
        RABBIT_MQ_WARDROBE_QUEUE: Joi.string().required(),
        RABBIT_MQ_MEDIA_STORAGE_QUEUE: Joi.string().required(),
        PROTECTED_DATA_SECRET: Joi.string().min(16).required(),
        GEMINI_API_KEY: Joi.string().required(),
        GEMINI_MODEL: Joi.string().required(),
        AI_ASSISTANT_WEBHOOK_URL: Joi.string().uri().required(),
        AI_ASSISTANT_WEBHOOK_AUTH_HEADER: Joi.string().required(),
        WEBHOOK_MAX_ATTEMPTS: Joi.number().default(5),
        WEBHOOK_RETRY_INTERVAL_MS: Joi.number().default(60000),
        OPENWEATHERMAP_API_KEY: Joi.string().optional().allow(''),
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    TypeOrmModule.forFeature([
      AssistantSessionEntity,
      AssistantMessageEntity,
      AssistantOutfitSuggestionEntity,
      AssistantWebhookJobEntity,
      UserAccountEntity,
    ]),
    RmqModule.register({ name: WARDROBE_SERVICE }),
    RmqModule.register({ name: MEDIA_STORAGE_SERVICE }),
  ],
  controllers: [AiAssistantController],
  providers: [
    ConversationService,
    GeminiClientService,
    ContextBuilderService,
    WeatherService,
    WebhookQueueService,
    WebhookDispatcherJob,
    WebhookHttpService,
    HttpService,
  ],
})
export class AiAssistantModule {}

