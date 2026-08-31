import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Ctx, EventPattern, RmqContext } from '@nestjs/microservices';
import { ValidationError } from 'class-validator';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { CreateErrorLogDto, ERROR_LOG_EVENTS } from '@app/logger';

import { ErrorLogService } from './error-log.service';

const logger = new Logger('ErrorLogValidation');

const describeValidationErrors = (errors: ValidationError[]): string =>
  errors
    .map((error) => {
      const constraints = Object.values(error.constraints ?? {}).join(', ');
      return `${error.property}=${JSON.stringify(error.value)} (${constraints})`;
    })
    .join('; ');

@UseFilters(MicroserviceExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors: ValidationError[]) => {
      logger.warn(
        `Rejected error-log.create payload, message discarded: ${describeValidationErrors(errors)}`,
      );
      return new BadRequestException(errors);
    },
  }),
)
@Controller()
export class ErrorLogController {
  constructor(
    private readonly errorLogService: ErrorLogService,
    private readonly rmqService: RmqService,
  ) {}

  @EventPattern(ERROR_LOG_EVENTS.create)
  async create(
    @Ctx() context: RmqContext,
    @Body() payload: CreateErrorLogDto,
  ): Promise<void> {
    try {
      await this.errorLogService.create(payload);
    } finally {
      this.rmqService.ack(context);
    }
  }
}
