import {
  ArgumentsHost,
  Catch,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseRpcExceptionFilter, RmqContext } from '@nestjs/microservices';
import { throwError } from 'rxjs';
import { EntityNotFoundError } from 'typeorm';

import { RmqService } from '@app/common/rmq/rmq.service';

@Injectable()
@Catch()
export class MicroserviceExceptionFilter extends BaseRpcExceptionFilter {
  constructor(private readonly rmqService: RmqService) {
    super();
  }

  catch(exception: any, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      const context = host.switchToRpc().getContext<RmqContext>();
      this.rmqService.ack(context);
      return throwError(() => exception.getResponse());
    }

    if (exception instanceof EntityNotFoundError) {
      return throwError(() => new NotFoundException().getResponse());
    }

    return super.catch(exception, host);
  }
}
