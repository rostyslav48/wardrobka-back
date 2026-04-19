import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { Public } from './decorators';

import {
  CreateUserAccountRequest,
  LoginRequest,
  UpdateProfileRequest,
} from '@app/auth/dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  login(@Body() request: LoginRequest) {
    return this.authService.login(request);
  }

  @Post('signup')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  createUserAccount(@Body() request: CreateUserAccountRequest) {
    return this.authService.signup(request);
  }

  @Get('profile')
  getProfile() {
    return this.authService.getProfile();
  }

  @Patch('profile')
  updateProfile(@Body() request: UpdateProfileRequest) {
    return this.authService.updateProfile(request);
  }
}
