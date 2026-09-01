import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';

import { DatabaseModule, RmqModule } from '@app/common';
import { HttpService } from '@app/common/http';
import {
  AssistantMessageEntity,
  AssistantOutfitSuggestionEntity,
  AssistantSessionEntity,
  AssistantWebhookJobEntity,
} from '@app/common/database/entities/assistant';
import { UserAccountEntity } from '@app/common/database/entities/auth';
import { GoogleCalendarCredentialEntity } from '@app/common/database/entities/calendar';
import {
  MEDIA_STORAGE_SERVICE,
  WARDROBE_SERVICE,
} from '@app/wardrobe-api-gateway/constants';

import { AiAssistantController } from './controllers/ai-assistant.controller';
import { ProductImageController } from './controllers/product-image.controller';
import { ConversationService } from './services/conversation.service';
import { GeminiClientService } from './services/gemini-client.service';
import { ContextBuilderService } from './services/context-builder.service';
import { ImageAnalyzerService } from './services/image-analyzer.service';
import { ProductImageGeneratorService } from './services/product-image-generator.service';
import { MediaStorageService } from '@app/wardrobe/media-storage/media-storage.service';
import { WeatherService } from './services/weather.service';
import { WebhookQueueService } from './services/webhook-queue.service';
import { WebhookDispatcherJob } from './jobs/webhook-dispatcher.job';
import { WebhookHttpService } from './webhook/webhook-http.service';
import { CalendarController } from './calendar/calendar.controller';
import { GoogleCalendarService } from './calendar/google-calendar.service';
import { GoogleOAuthService } from './calendar/google-oauth.service';
import { GoogleTokenService } from './calendar/google-token.service';

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
        AI_HISTORY_MESSAGE_LIMIT: Joi.number().integer().min(1).default(10),
        AI_MAX_TOOL_ROUNDS: Joi.number().integer().min(1).default(4),
        AI_MAX_TOOL_CALLS: Joi.number().integer().min(1).default(8),
        AI_TOOL_ROW_LIMIT: Joi.number().integer().min(1).default(100),
        AI_TOOL_RPC_TIMEOUT_MS: Joi.number().integer().min(1).default(8000),
        AI_WEATHER_CACHE_TTL_MS: Joi.number().integer().min(0).default(600000),
        GEMINI_ANALYZE_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1000)
          .default(15000),
        // Phase 0 default; gemini-3-pro-image is the escalation.
        GEMINI_IMAGE_MODEL: Joi.string().default('gemini-3.1-flash-image'),
        GEMINI_IMAGE_TIMEOUT_MS: Joi.number()
          .integer()
          .min(1000)
          .default(60000),
        // Destination folder for the generated image, shared with the wardrobe
        // service so both write item images to the same prefix.
        USER_IMAGES_FOLDER_PATH: Joi.string().required(),
        AI_ASSISTANT_WEBHOOK_URL: Joi.string().uri().required(),
        AI_ASSISTANT_WEBHOOK_AUTH_HEADER: Joi.string().required(),
        WEBHOOK_MAX_ATTEMPTS: Joi.number().default(5),
        WEBHOOK_RETRY_INTERVAL_MS: Joi.number().default(60000),
        OPENWEATHERMAP_API_KEY: Joi.string().optional().allow(''),
        // Every GOOGLE_* variable is optional, following OPENWEATHERMAP_API_KEY:
        // ai-assistant must boot for anyone who has not done the Google Console
        // setup, reporting every user as disconnected.
        GOOGLE_OAUTH_CLIENT_ID: Joi.string().optional().allow(''),
        GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().optional().allow(''),
        GOOGLE_OAUTH_REDIRECT_URI: Joi.string().optional().allow(''),
        GOOGLE_OAUTH_APP_REDIRECT: Joi.string().optional().allow(''),
        GOOGLE_CALENDAR_CACHE_TTL_MS: Joi.number()
          .integer()
          .min(0)
          .default(300000),
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
      GoogleCalendarCredentialEntity,
    ]),
    RmqModule.register({ name: WARDROBE_SERVICE }),
    RmqModule.register({ name: MEDIA_STORAGE_SERVICE }),
  ],
  controllers: [
    AiAssistantController,
    CalendarController,
    ProductImageController,
  ],
  providers: [
    ConversationService,
    GeminiClientService,
    ContextBuilderService,
    ImageAnalyzerService,
    ProductImageGeneratorService,
    MediaStorageService,
    WeatherService,
    WebhookQueueService,
    WebhookDispatcherJob,
    WebhookHttpService,
    HttpService,
    GoogleOAuthService,
    GoogleTokenService,
    GoogleCalendarService,
  ],
})
export class AiAssistantModule {}
