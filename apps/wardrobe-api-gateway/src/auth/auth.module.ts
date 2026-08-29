import { Module } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { RmqModule } from '@app/common';

import { AuthController } from './auth.controller';
import { ClientProxyService } from '../services/client-proxy.service';

import { AuthService } from './auth.service';

import { AUTH_SERVICE, CLIENT_PROXY_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: AUTH_SERVICE,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: CLIENT_PROXY_SERVICE,
      useFactory: (clientProxy: ClientProxy) =>
        new ClientProxyService(clientProxy),
      inject: [AUTH_SERVICE],
    },
  ],
})
export class AuthModule {}
