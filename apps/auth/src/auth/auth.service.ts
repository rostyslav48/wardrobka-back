import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service';

import { AuthUserAccount } from './types';
import { UserAccountPreview } from '../users/types';

import { LoginRequest } from '../dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async authenticate(input: LoginRequest): Promise<AuthUserAccount> {
    const user = await this.validateUser(input);

    if (!user) {
      throw new UnauthorizedException();
    }

    return this.signIn(user);
  }

  private async validateUser(input: LoginRequest): Promise<UserAccountPreview> {
    const user = await this.usersService.findUserByEmail(input.email);

    if (user && user.password === input.password) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }

    return null;
  }

  private async signIn(user: UserAccountPreview): Promise<AuthUserAccount> {
    const tokenPayload = {
      id: user.id,
      username: user.name,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(tokenPayload);

    return { accessToken, ...user };
  }
}
