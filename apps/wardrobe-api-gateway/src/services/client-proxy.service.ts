import { ClientProxy } from '@nestjs/microservices';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class ClientProxyService {
  constructor(private readonly clientProxy: ClientProxy) {}

  public send<T>(
    pattern: string,
    payload: T,
    user: UserAccountPreview | null = null,
  ): Observable<any> {
    return this.clientProxy.send(pattern, {
      data: payload,
      user,
    });
  }
}
