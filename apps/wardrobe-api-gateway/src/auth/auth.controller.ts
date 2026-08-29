import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { CurrentUser, Public } from './decorators';

import {
  CreateUserAccountRequest,
  LoginRequest,
  UpdateProfileRequest,
  UpsertPushTokenRequest,
} from '@app/auth/dto';
import { UserAccountPreview } from '@app/auth/users/types';

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
  getProfile(@CurrentUser() user: UserAccountPreview) {
    return this.authService.getProfile(user);
  }

  @Patch('profile')
  updateProfile(
    @Body() request: UpdateProfileRequest,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.authService.updateProfile(request, user);
  }

  @Patch('push-token')
  upsertPushToken(
    @Body() request: UpsertPushTokenRequest,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.authService.upsertPushToken(request, user);
  }
}
