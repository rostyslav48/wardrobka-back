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
    @Body() request: LoginRequest,
  ): Promise<AuthUserAccount> {
    const user = await this.authService.validateUser(request);

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
    @Body() request: CreateUserAccountRequest,
  ) {
    if (await this.usersService.checkEmail(request.email)) {
      throw new ConflictException('User with this email already exists');
    }

    const authUser = await this.authService.signup(request);
    this.rmqService.ack(context);

    return authUser;
  }
}
