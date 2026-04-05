import { APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ThrottlerModule } from '@nestjs/throttler';

import { RmqModule } from '@app/common';

import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { ClientProxyService } from '../services/client-proxy.service';
import { InjectUserInterceptor } from '../interceptors';
import { AI_ASSISTANT_SERVICE, CLIENT_PROXY_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: AI_ASSISTANT_SERVICE,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 1000,
          limit: 3,
        },
      ],
    }),
  ],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    {
      provide: CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [AI_ASSISTANT_SERVICE],
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (clientProxy: ClientProxyService) =>
        new InjectUserInterceptor(clientProxy),
      inject: [CLIENT_PROXY_SERVICE],
    },
  ],
})
export class AiAssistantModule {}
