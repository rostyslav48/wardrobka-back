import {
  Body,
  ConflictException,
  Controller,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

import { RequestType } from '@app/common/types';
import { AuthUserAccount } from './types';

import { CreateUserAccountRequest, LoginRequest } from '../dto';

import { AUTH_REQUESTS } from '../constants';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rmqService: RmqService,
    private readonly usersService: UsersService,
  ) {}

  @MessagePattern(AUTH_REQUESTS.login)
  async login(
    @Ctx() context: RmqContext,
    @Body() { data }: RequestType<LoginRequest>,
  ): Promise<AuthUserAccount> {
    const user = await this.authService.validateUser(data);

    if (!user) {
      throw new UnauthorizedException();
    }

    const authModel = await this.authService.signIn(user);
    this.rmqService.ack(context);

    return authModel;
  }

  @MessagePattern(AUTH_REQUESTS.signup)
  async signup(
    @Ctx() context: RmqContext,
    @Body() { data }: RequestType<CreateUserAccountRequest>,
  ) {
    if (await this.usersService.checkEmail(data.email)) {
      throw new ConflictException('User with this email already exists');
    }

    const authUser = await this.authService.signup(data);
    this.rmqService.ack(context);

    return authUser;
  }
}
