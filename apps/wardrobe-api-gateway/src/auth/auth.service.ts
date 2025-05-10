import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { CreateUserAccountRequest, LoginRequest } from '@app/auth/dto';

import { AUTH_SERVICE } from '../constants';
import { AUTH_REQUESTS } from '@app/auth/constants';

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_SERVICE) private authClient: ClientProxy) {}

  login(request: LoginRequest) {
    return this.authClient.send(AUTH_REQUESTS.login, request);
  }

  signup(request: CreateUserAccountRequest) {
    return this.authClient.send(AUTH_REQUESTS.signup, request);
  }
}
