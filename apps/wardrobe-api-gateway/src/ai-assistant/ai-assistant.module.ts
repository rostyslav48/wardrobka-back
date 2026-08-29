import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { RmqModule } from '@app/common';

import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { ClientProxyService } from '../services/client-proxy.service';
import { AI_ASSISTANT_SERVICE, CLIENT_PROXY_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: AI_ASSISTANT_SERVICE,
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
  ],
})
export class AiAssistantModule {}
