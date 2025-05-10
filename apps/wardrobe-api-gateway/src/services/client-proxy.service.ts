import { ClientProxy } from '@nestjs/microservices';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class ClientProxyService {
  private user: UserAccountPreview = null;

  constructor(private readonly clientProxy: ClientProxy) {}

  public setUser(user: UserAccountPreview) {
    this.user = user;
  }

  public send<T>(pattern: string, payload: T): Observable<any> {
    return this.clientProxy.send(pattern, {
      data: payload,
      user: this.user,
    });
  }
}
