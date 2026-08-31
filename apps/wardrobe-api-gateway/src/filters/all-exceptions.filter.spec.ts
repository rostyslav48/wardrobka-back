import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { ErrorLoggerService } from '@app/logger';

import { AllExceptionsFilter } from './all-exceptions.filter';

const makeHost = (request: any): ArgumentsHost => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
};

const makeRequest = (overrides: Record<string, any> = {}) => ({
  method: 'GET',
  originalUrl: '/outfit-log/not-a-uuid',
  ...overrides,
});

describe('AllExceptionsFilter', () => {
  let errorLogger: jest.Mocked<
    Pick<ErrorLoggerService, 'warn' | 'error' | 'fatal'>
  >;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    errorLogger = {
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    };
    filter = new AllExceptionsFilter(
      errorLogger as unknown as ErrorLoggerService,
    );
  });

  it('responds with the HttpException status/body and logs warn below 500', () => {
    const request = makeRequest({ user: { id: 42 } });
    const host = makeHost(request);
    const exception = new BadRequestException('Validation failed');

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(exception.getResponse());

    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        errorName: 'BadRequestException',
        requestMethod: 'GET',
        requestPath: '/outfit-log/not-a-uuid',
        accountId: 42,
      }),
    );
    expect(errorLogger.error).not.toHaveBeenCalled();
    expect(errorLogger.fatal).not.toHaveBeenCalled();
  });

  it('logs error (not warn) for an HttpException with a >= 500 status', () => {
    const host = makeHost(makeRequest());
    const exception = new InternalServerErrorException('boom');

    filter.catch(exception, host);

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
    expect(errorLogger.warn).not.toHaveBeenCalled();
  });

  it('detects a bare microservice error object and uses its statusCode', () => {
    const request = makeRequest();
    const host = makeHost(request);
    const exception = {
      statusCode: 400,
      message: 'invalid input syntax for type uuid: "not-a-uuid"',
      error: 'Bad Request',
    };

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(exception);

    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: exception.message,
        errorName: 'Bad Request',
      }),
    );
  });

  it('logs error (not warn) for a bare microservice object with a >= 500 statusCode', () => {
    const host = makeHost(makeRequest());
    const exception = { statusCode: 503, message: 'unavailable' };

    filter.catch(exception, host);

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503 }),
    );
    expect(errorLogger.warn).not.toHaveBeenCalled();
  });

  it('treats an http-errors-style Error (e.g. PayloadTooLargeError) as a handled error, not fatal', () => {
    const host = makeHost(makeRequest());
    const exception = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
    });

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 413,
      message: 'request entity too large',
    });

    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 413,
        message: 'request entity too large',
        errorName: 'Error',
      }),
    );
    expect(errorLogger.error).not.toHaveBeenCalled();
    expect(errorLogger.fatal).not.toHaveBeenCalled();
  });

  it('treats anything else as fatal, responds with a generic 500 body and never leaks the stack', () => {
    const host = makeHost(makeRequest());
    const exception = new Error('unexpected crash');

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });

    expect(errorLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'unexpected crash',
        errorName: 'Error',
        stack: exception.stack,
      }),
    );
  });

  it('handles a thrown non-Error value as fatal without throwing, preserving it in meta', () => {
    const host = makeHost(makeRequest());

    expect(() => filter.catch('just a string', host)).not.toThrow();

    expect(errorLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unknown error',
        stack: undefined,
        meta: { raw: 'just a string' },
      }),
    );
  });

  it("falls back to a plain object payload's message and stashes it in meta when it has no statusCode", () => {
    // Shape of @nestjs/microservices' BaseRpcExceptionFilter.handleUnknownError output,
    // which is neither an HttpException, a microservice-shaped {statusCode,...} object,
    // nor an Error, so it previously fell into the fatal catch-all contentless.
    const host = makeHost(makeRequest());
    const exception = { status: 'error', message: 'Internal server error' };

    filter.catch(exception, host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });

    expect(errorLogger.fatal).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        meta: { raw: exception },
      }),
    );
  });

  it('omits accountId when the request has no authenticated user', () => {
    const host = makeHost(makeRequest());

    filter.catch(new BadRequestException(), host);

    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: undefined }),
    );
  });
});
