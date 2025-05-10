import { Inject, Injectable } from '@nestjs/common';

import { ClientProxyService } from '../services/client-proxy.service';

import { CreateUserAccountRequest, LoginRequest } from '@app/auth/dto';

import { CLIENT_PROXY_SERVICE } from '../constants';
import { AUTH_REQUESTS } from '@app/auth/constants';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE) private authClient: ClientProxyService,
  ) {}

  login(request: LoginRequest) {
    return this.authClient.send(AUTH_REQUESTS.login, request);
  }

  signup(request: CreateUserAccountRequest) {
    return this.authClient.send(AUTH_REQUESTS.signup, request);
  }
}
