import { of, throwError } from 'rxjs';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';

import { ERROR_LOG_EVENTS } from './constants';
import { ErrorLoggerService } from './error-logger.service';

describe('ErrorLoggerService', () => {
  let emit: jest.Mock;
  let client: ClientProxy;
  let configValues: Record<string, unknown>;
  let configService: ConfigService;

  const makeConfigService = (values: Record<string, unknown>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  beforeEach(() => {
    emit = jest.fn().mockReturnValue(of(undefined));
    client = { emit } as unknown as ClientProxy;
    configValues = { SERVICE_NAME: 'wardrobe-api-gateway' };
    configService = makeConfigService(configValues);
  });

  it('emits warn/error/fatal at the default min severity', () => {
    const service = new ErrorLoggerService(client, configService);

    service.warn({ message: 'w' });
    service.error({ message: 'e' });
    service.fatal({ message: 'f' });

    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('drops calls below ERROR_LOG_MIN_SEVERITY', () => {
    configValues.ERROR_LOG_MIN_SEVERITY = 'error';
    const service = new ErrorLoggerService(client, configService);

    service.warn({ message: 'dropped' });
    expect(emit).not.toHaveBeenCalled();

    service.error({ message: 'kept' });
    service.fatal({ message: 'kept' });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('stamps service from the register() option in preference to SERVICE_NAME', () => {
    const service = new ErrorLoggerService(client, configService, {
      serviceName: 'ai-assistant',
    });

    service.error({ message: 'e' });

    expect(emit).toHaveBeenCalledWith(
      ERROR_LOG_EVENTS.create,
      expect.objectContaining({ service: 'ai-assistant' }),
    );
  });

  it('emits the full DTO with severity and the create event name', () => {
    const service = new ErrorLoggerService(client, configService);

    service.fatal({ message: 'boom', statusCode: 500, correlationId: 'abc' });

    expect(emit).toHaveBeenCalledWith(ERROR_LOG_EVENTS.create, {
      message: 'boom',
      statusCode: 500,
      correlationId: 'abc',
      severity: 'fatal',
      service: 'wardrobe-api-gateway',
    });
  });

  it('stamps service="unknown" and logs a fallback warning when no service name is configured', () => {
    delete configValues.SERVICE_NAME;
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const service = new ErrorLoggerService(client, configService);
    service.error({ message: 'e' });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ErrorLoggerService has no serviceName'),
    );
    expect(emit).toHaveBeenCalledWith(
      ERROR_LOG_EVENTS.create,
      expect.objectContaining({ service: 'unknown' }),
    );

    errorSpy.mockRestore();
  });

  it('does not throw and returns undefined when client.emit throws synchronously', () => {
    emit.mockImplementation(() => {
      throw new Error('sync boom');
    });
    const service = new ErrorLoggerService(client, configService);

    expect(service.error({ message: 'e' })).toBeUndefined();
  });

  it('does not throw when the emit observable errors asynchronously', () => {
    emit.mockReturnValue(throwError(() => new Error('connect failed')));
    const service = new ErrorLoggerService(client, configService);

    expect(() => service.error({ message: 'e' })).not.toThrow();
  });
});
