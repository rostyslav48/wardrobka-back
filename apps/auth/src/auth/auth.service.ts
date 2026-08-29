import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service';
import { BcryptService } from './services/bcrypt.service';

import { AuthUserAccount } from './types';
import { UserAccountPreview } from '../users/types';

import { CreateUserAccountRequest, LoginRequest } from '../dto';

// A valid bcrypt hash of an unusable password. Compared against when no
// account exists so a missing user and a wrong password take the same time
// and return the same result — otherwise login leaks account existence.
const DUMMY_PASSWORD_HASH =
  '$2b$10$nBrOsli2dgf7VBBp9Zih1OsKsLATgMygCpUd6.voP7//aiLLf.yKi';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private bcryptService: BcryptService,
  ) {}

  public async validateUser(input: LoginRequest): Promise<UserAccountPreview> {
    const user = await this.usersService
      .findUserByEmail(input.email)
      .catch(() => null);

    const passwordMatches = await this.bcryptService.comparePassword(
      input.password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (user && passwordMatches) {
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

    // Build the response from named fields rather than spreading the entity —
    // the entity also carries `protectedData` and `expoPushToken`, which must
    // never be serialised back to the client (see BUG-006).
    return this.signIn({ id: user.id, name: user.name, email: user.email });
  }
}
