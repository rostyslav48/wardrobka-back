import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { RmqModule } from '@app/common';

import { OutfitLogController } from './outfit-log.controller';
import { OutfitLogService } from './outfit-log.service';
import { ClientProxyService } from '../services/client-proxy.service';
import { CLIENT_PROXY_SERVICE, WARDROBE_SERVICE } from '../constants';

@Module({
  imports: [RmqModule.register({ name: WARDROBE_SERVICE })],
  controllers: [OutfitLogController],
  providers: [
    OutfitLogService,
    {
      provide: CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [WARDROBE_SERVICE],
    },
  ],
})
export class OutfitLogModule {}
