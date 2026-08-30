import {
  Body,
  Controller,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Ctx, EventPattern, RmqContext } from '@nestjs/microservices';

import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { CreateErrorLogDto, ERROR_LOG_EVENTS } from '@app/logger';

import { ErrorLogService } from './error-log.service';

@UseFilters(MicroserviceExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
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
