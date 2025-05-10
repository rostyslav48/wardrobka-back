import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service';

import { Public } from './decorators';

import { CreateUserAccountRequest, LoginRequest } from '../../../auth/src/dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() request: LoginRequest) {
    return this.authService.login(request);
  }

  @Post('signup')
  @Public()
  createUserAccount(@Body() request: CreateUserAccountRequest) {
    return this.authService.signup(request);
  }
}
