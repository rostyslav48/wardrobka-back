import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { ClientProxyService } from '../services/client-proxy.service';

@Injectable()
export class InjectUserInterceptor implements NestInterceptor {
  constructor(private readonly clientProxyService: ClientProxyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    this.clientProxyService.setUser(user);

    return next.handle();
  }
}
