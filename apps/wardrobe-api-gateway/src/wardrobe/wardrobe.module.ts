import { APP_INTERCEPTOR } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { RmqModule } from '@app/common';

import { WardrobeController } from './wardrobe.controller';

import { WardrobeService } from './wardrobe.service';
import { ClientProxyService } from '../services/client-proxy.service';

import { InjectUserInterceptor } from '../interceptors';

import { CLIENT_PROXY_SERVICE, WARDROBE_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: WARDROBE_SERVICE,
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
      provide: APP_INTERCEPTOR,
      useFactory: (clientProxy: ClientProxyService) =>
        new InjectUserInterceptor(clientProxy),
      inject: [CLIENT_PROXY_SERVICE],
    },
  ],
})
export class WardrobeModule {}
