import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { LoginRequest } from '../../../auth/src/dto';

import { AUTH_SERVICE } from '../constants';
import { AUTH_REQUESTS } from '../../../auth/src/constants';

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_SERVICE) private authClient: ClientProxy) {}

  login(request: LoginRequest) {
    return this.authClient.send(AUTH_REQUESTS.login, request);
  }
}
