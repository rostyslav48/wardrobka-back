import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { RmqModule } from '@app/common';

import { WardrobeController } from './wardrobe.controller';

import { WardrobeService } from './wardrobe.service';
import { ClientProxyService } from '../services/client-proxy.service';

import {
  AI_ASSISTANT_SERVICE,
  CLIENT_PROXY_SERVICE,
  WARDROBE_SERVICE,
} from '../constants';
import { AI_ASSISTANT_CLIENT_PROXY_SERVICE } from './constants';

@Module({
  imports: [
    RmqModule.register({
      name: WARDROBE_SERVICE,
    }),
    RmqModule.register({
      name: AI_ASSISTANT_SERVICE,
    }),
  ],
  controllers: [WardrobeController],
  providers: [
    WardrobeService,
    {
      provide: CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [WARDROBE_SERVICE],
    },
    {
      provide: AI_ASSISTANT_CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [AI_ASSISTANT_SERVICE],
    },
  ],
})
export class WardrobeModule {}
