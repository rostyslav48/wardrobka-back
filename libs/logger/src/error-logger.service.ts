import { inspect } from 'node:util';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';

import { LOGGER_SERVICE } from '@app/wardrobe-api-gateway/constants';

import { ERROR_LOG_EVENTS, ERROR_LOGGER_MODULE_OPTIONS } from './constants';
import { CreateErrorLogDto } from './dto';
import { ErrorLoggerModuleOptions, ErrorLogSeverity } from './types';

export type ErrorLogPayload = Omit<CreateErrorLogDto, 'severity' | 'service'>;

const SEVERITY_RANK: Record<ErrorLogSeverity, number> = {
  warn: 0,
  error: 1,
  fatal: 2,
};

const DEFAULT_MIN_SEVERITY: ErrorLogSeverity = 'warn';

@Injectable()
export class ErrorLoggerService {
  private readonly fallbackLogger = new Logger('ErrorLogger');
  private readonly serviceName: string;
  private readonly minSeverity: ErrorLogSeverity;

  constructor(
    @Inject(LOGGER_SERVICE) private readonly client: ClientProxy,
    private readonly configService: ConfigService,
    @Optional()
    @Inject(ERROR_LOGGER_MODULE_OPTIONS)
    options?: ErrorLoggerModuleOptions,
  ) {
    this.serviceName =
      options?.serviceName ?? this.configService.get<string>('SERVICE_NAME');
    this.minSeverity =
      this.configService.get<ErrorLogSeverity>('ERROR_LOG_MIN_SEVERITY') ??
      DEFAULT_MIN_SEVERITY;
  }

  warn(payload: ErrorLogPayload): void {
    this.log('warn', payload);
  }

  error(payload: ErrorLogPayload): void {
    this.log('error', payload);
  }

  fatal(payload: ErrorLogPayload): void {
    this.log('fatal', payload);
  }

  private log(severity: ErrorLogSeverity, payload: ErrorLogPayload): void {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[this.minSeverity]) {
      return;
    }

    const dto: CreateErrorLogDto = {
      ...payload,
      severity,
      service: this.serviceName,
    };

    try {
      this.client.emit(ERROR_LOG_EVENTS.create, dto).subscribe({
        error: (err) => this.logFallback(err),
      });
    } catch (err) {
      this.logFallback(err);
    }
  }

  private logFallback(err: unknown): void {
    this.fallbackLogger.error(
      `Failed to emit "${ERROR_LOG_EVENTS.create}": ${
        err instanceof Error ? err.message : inspect(err, { depth: 3 })
      }`,
      err instanceof Error ? err.stack : undefined,
    );
  }
}
