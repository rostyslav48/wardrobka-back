import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service';
import { BcryptService } from './services/bcrypt.service';

import { AuthUserAccount } from './types';
import { UserAccountPreview } from '../users/types';

import { CreateUserAccountRequest, LoginRequest } from '../dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private bcryptService: BcryptService,
  ) {}

  public async validateUser(input: LoginRequest): Promise<UserAccountPreview> {
    const user = await this.usersService.findUserByEmail(input.email);

    if (
      user &&
      (await this.bcryptService.comparePassword(input.password, user.password))
    ) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    }

    return null;
  }

  public async signIn(user: UserAccountPreview): Promise<AuthUserAccount> {
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(tokenPayload);

    return { accessToken, ...user };
  }

  public async signup(dto: CreateUserAccountRequest): Promise<AuthUserAccount> {
    const hashPassword = await this.bcryptService.encodePassword(dto.password);

    const user = await this.usersService.createUser({
      ...dto,
      password: hashPassword,
    });

    delete user.password;

    return this.signIn(user);
  }
}
