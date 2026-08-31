import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { RmqModule } from '@app/common';

import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { ClientProxyService } from '../services/client-proxy.service';
import { AI_ASSISTANT_SERVICE, CLIENT_PROXY_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: AI_ASSISTANT_SERVICE,
    }),
  ],
  // CalendarController lives here rather than in a module of its own: a second
  // RmqModule.register({ name: AI_ASSISTANT_SERVICE }) would open a second AMQP
  // connection to the same queue. @Controller('calendar') keeps the URLs
  // independent of the hosting module.
  controllers: [AiAssistantController, CalendarController],
  providers: [
    AiAssistantService,
    CalendarService,
    {
      provide: CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [AI_ASSISTANT_SERVICE],
    },
  ],
})
export class AiAssistantModule {}
