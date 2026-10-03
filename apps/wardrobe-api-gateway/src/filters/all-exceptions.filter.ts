import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { ErrorLoggerService } from '@app/logger';
import { UserAccountPreview } from '@app/auth/users/types';

type RequestWithUser = Request & { user?: UserAccountPreview };

interface MicroserviceErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

interface ErrorLikeWithStatusCode extends Error {
  statusCode: number;
}

const GENERIC_SERVER_ERROR_BODY = {
  statusCode: 500,
  message: 'Internal server error',
};

function isMicroserviceErrorResponse(
  exception: unknown,
): exception is MicroserviceErrorResponse {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    !(exception instanceof Error) &&
    typeof (exception as Record<string, unknown>).statusCode === 'number' &&
    'message' in exception
  );
}

/**
 * Covers errors from libraries such as `http-errors` (e.g. body-parser's
 * PayloadTooLargeError) that carry a `statusCode` but are real `Error`
 * instances, not `HttpException`s. Nest's own BaseExceptionFilter treats
 * these the same as an HttpException (isHttpError check); without this
 * branch they fell through to the fatal/500 catch-all.
 */
function isErrorLikeWithStatusCode(
  exception: unknown,
): exception is ErrorLikeWithStatusCode {
  return (
    exception instanceof Error &&
    typeof (exception as unknown as Record<string, unknown>).statusCode ===
      'number'
  );
}

function flattenMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * Registered as an APP_FILTER provider (not app.useGlobalFilters in main.ts)
 * so it goes through Nest's DI and can inject ErrorLoggerService.
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly errorLogger: ErrorLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      this.log(statusCode >= 500 ? 'error' : 'warn', {
        statusCode,
        message:
          typeof body === 'string'
            ? body
            : flattenMessage(
                (body as { message?: string | string[] }).message ??
                  exception.message,
              ),
        errorName: exception.name,
        stack: exception.stack,
        request,
      });
      response.status(statusCode).json(body);
      return;
    }

    if (isMicroserviceErrorResponse(exception)) {
      const { statusCode } = exception;
      this.log(statusCode >= 500 ? 'error' : 'warn', {
        statusCode,
        message: flattenMessage(exception.message),
        errorName: exception.error,
        request,
      });
      response.status(statusCode).json(exception);
      return;
    }

    if (isErrorLikeWithStatusCode(exception)) {
      const { statusCode, message, name, stack } = exception;
      this.log(statusCode >= 500 ? 'error' : 'warn', {
        statusCode,
        message,
        errorName: name,
        stack,
        request,
      });
      response.status(statusCode).json({ statusCode, message });
      return;
    }

    const plain =
      typeof exception === 'object' && exception !== null
        ? (exception as Record<string, unknown>)
        : undefined;

    this.log('fatal', {
      statusCode: 500,
      message:
        exception instanceof Error
          ? exception.message
          : typeof plain?.message === 'string'
            ? plain.message
            : 'Unknown error',
      errorName: exception instanceof Error ? exception.name : undefined,
      stack: exception instanceof Error ? exception.stack : undefined,
      meta:
        exception instanceof Error
          ? undefined
          : { raw: plain ?? String(exception) },
      request,
    });
    response.status(500).json(GENERIC_SERVER_ERROR_BODY);
  }

  private log(
    severity: 'warn' | 'error' | 'fatal',
    details: {
      statusCode: number;
      message: string;
      errorName?: string;
      stack?: string;
      meta?: Record<string, unknown>;
      request: RequestWithUser;
    },
  ): void {
    const { statusCode, message, errorName, stack, meta, request } = details;

    this.errorLogger[severity]({
      context: AllExceptionsFilter.name,
      message,
      errorName,
      statusCode,
      stack,
      meta,
      requestMethod: request.method,
      requestPath: request.originalUrl ?? request.url,
      accountId: request.user?.id,
    });
  }
}
