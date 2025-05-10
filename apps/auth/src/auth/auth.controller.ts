import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { AuthService } from './auth.service';

import { AuthUserAccount } from './types';

import { LoginRequest } from '../dto';

import { AUTH_REQUESTS } from '../constants';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(AUTH_REQUESTS.login)
  async login(
    @Ctx() context: RmqContext,
    @Body() request: LoginRequest,
  ): Promise<AuthUserAccount> {
    const authModel = await this.authService.authenticate(request);
    this.rmqService.ack(context);

    return authModel;
  }
}
