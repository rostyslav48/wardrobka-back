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
// Imported by direct path, not the `@app/logger` barrel: the barrel re-exports
// ErrorLoggerModule, which imports `@app/common` (RmqModule) — going through
// it here would create a circular module graph with this file's own barrel
// (`@app/common/index.ts` re-exports this filter).
import { ErrorLoggerService } from '@app/logger/error-logger.service';

const RPC_REQUEST_METHOD = 'RMQ';

@Injectable()
@Catch()
export class MicroserviceExceptionFilter extends BaseRpcExceptionFilter {
  constructor(
    private readonly rmqService: RmqService,
    private readonly errorLogger: ErrorLoggerService,
  ) {
    super();
  }

  catch(exception: any, host: ArgumentsHost) {
    const context = host.switchToRpc().getContext<RmqContext>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      this.log(statusCode >= 500 ? 'error' : 'warn', {
        statusCode,
        message: exception.message,
        errorName: exception.name,
        stack: exception.stack,
        context,
      });
      this.rmqService.ack(context);
      return throwError(() => exception.getResponse());
    }

    if (exception instanceof EntityNotFoundError) {
      this.log('warn', {
        statusCode: 404,
        message: exception.message,
        errorName: exception.name,
        stack: exception.stack,
        context,
      });
      return throwError(() => new NotFoundException().getResponse());
    }

    this.log('error', {
      statusCode: 500,
      message:
        exception instanceof Error ? exception.message : String(exception),
      errorName: exception instanceof Error ? exception.name : undefined,
      stack: exception instanceof Error ? exception.stack : undefined,
      context,
    });

    return super.catch(exception, host);
  }

  private log(
    severity: 'warn' | 'error',
    details: {
      statusCode: number;
      message: string;
      errorName?: string;
      stack?: string;
      context: RmqContext;
    },
  ): void {
    const { statusCode, message, errorName, stack, context } = details;

    this.errorLogger[severity]({
      context: MicroserviceExceptionFilter.name,
      message,
      errorName,
      statusCode,
      stack,
      requestMethod: RPC_REQUEST_METHOD,
      requestPath: context.getPattern(),
    });
  }
}
