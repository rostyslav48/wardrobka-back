import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { EntityNotFoundError } from 'typeorm';

import { RmqService } from '@app/common/rmq/rmq.service';
import { ErrorLoggerService } from '@app/logger/error-logger.service';

import { MicroserviceExceptionFilter } from './microservice-exception-filter';

const makeHost = (pattern = 'get_wardrobe_items'): ArgumentsHost => {
  const context = {
    getPattern: () => pattern,
    getMessage: () => ({}),
    getChannelRef: () => ({}),
  } as unknown as RmqContext;

  return {
    switchToRpc: () => ({
      getContext: () => context,
      getData: () => ({}),
    }),
  } as unknown as ArgumentsHost;
};

describe('MicroserviceExceptionFilter', () => {
  let errorLogger: jest.Mocked<
    Pick<ErrorLoggerService, 'warn' | 'error' | 'fatal'>
  >;
  let rmqService: jest.Mocked<Pick<RmqService, 'ack'>>;
  let filter: MicroserviceExceptionFilter;

  beforeEach(() => {
    errorLogger = { warn: jest.fn(), error: jest.fn(), fatal: jest.fn() };
    rmqService = { ack: jest.fn() };
    filter = new MicroserviceExceptionFilter(
      rmqService as unknown as RmqService,
      errorLogger as unknown as ErrorLoggerService,
    );
  });

  it('logs warn and acks for an HttpException below 500, rethrowing its response unchanged', async () => {
    const host = makeHost('create_wardrobe_item');
    const exception = new BadRequestException('Validation failed');

    const result$ = filter.catch(exception, host);
    await expect(firstValueFrom(result$)).rejects.toEqual(
      exception.getResponse(),
    );

    expect(rmqService.ack).toHaveBeenCalledTimes(1);
    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        errorName: 'BadRequestException',
        requestMethod: 'RMQ',
        requestPath: 'create_wardrobe_item',
      }),
    );
    expect(errorLogger.error).not.toHaveBeenCalled();
  });

  it('logs error (not warn) for an HttpException with a >= 500 status', async () => {
    const host = makeHost();
    const exception = new BadRequestException('boom');
    jest.spyOn(exception, 'getStatus').mockReturnValue(503);

    const result$ = filter.catch(exception, host);
    await expect(firstValueFrom(result$)).rejects.toBeDefined();

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503 }),
    );
    expect(errorLogger.warn).not.toHaveBeenCalled();
  });

  it('logs warn and rethrows a generic 404 for EntityNotFoundError, without acking', async () => {
    const host = makeHost('get_outfit_log');
    const exception = new EntityNotFoundError('OutfitLogEntity', {});

    const result$ = filter.catch(exception, host);
    await expect(firstValueFrom(result$)).rejects.toEqual(
      new NotFoundException().getResponse(),
    );

    expect(rmqService.ack).not.toHaveBeenCalled();
    expect(errorLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        errorName: 'EntityNotFoundError',
        requestPath: 'get_outfit_log',
      }),
    );
  });

  it('logs error with the real stack for an unrecognized exception before delegating to the base filter', () => {
    const host = makeHost('delete_wardrobe_item');
    const exception = new Error('unexpected crash');

    filter.catch(exception, host);

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'unexpected crash',
        errorName: 'Error',
        stack: exception.stack,
        requestPath: 'delete_wardrobe_item',
      }),
    );
  });

  it('does not throw when constructed without an ErrorLoggerService (the logger app itself omits it)', async () => {
    const host = makeHost('create_error_log');
    const bareFilter = new MicroserviceExceptionFilter(
      rmqService as unknown as RmqService,
    );
    const exception = new BadRequestException('Validation failed');

    const result$ = bareFilter.catch(exception, host);
    await expect(firstValueFrom(result$)).rejects.toEqual(
      exception.getResponse(),
    );

    expect(rmqService.ack).toHaveBeenCalledTimes(1);
  });

  it('logs a non-Error thrown value without throwing from the logger call itself', () => {
    const host = makeHost();

    expect(() => filter.catch('just a string', host)).not.toThrow();

    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'just a string',
        errorName: undefined,
        stack: undefined,
      }),
    );
  });
});
