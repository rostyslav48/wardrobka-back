import { Module } from '@nestjs/common';
import { RmqModule } from '@app/common';
import { AUTH_SERVICE } from '../constants/services';

@Module({
  imports: [
    RmqModule.register({
      name: AUTH_SERVICE,
    }),
  ],
})
export class AuthModule {}
