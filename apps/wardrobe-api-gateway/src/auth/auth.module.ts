import { Module } from '@nestjs/common';
import { RmqModule } from '@app/common';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { AUTH_SERVICE } from '../constants';

@Module({
  imports: [
    RmqModule.register({
      name: AUTH_SERVICE,
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
