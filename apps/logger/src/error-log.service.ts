import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ErrorLogEntity } from '@app/common/database/entities/logger';
import { CreateErrorLogDto } from '@app/logger';

const MAX_TEXT_LENGTH = 8000;

@Injectable()
export class ErrorLogService {
  constructor(
    @InjectRepository(ErrorLogEntity)
    private readonly errorLogRepository: Repository<ErrorLogEntity>,
  ) {}

  async create(payload: CreateErrorLogDto): Promise<void> {
    const {
      severity,
      service,
      context,
      message,
      errorName,
      statusCode,
      stack,
      requestMethod,
      requestPath,
      accountId,
      correlationId,
      meta,
    } = payload;

    await this.errorLogRepository.insert({
      severity,
      service,
      context,
      message: message.slice(0, MAX_TEXT_LENGTH),
      errorName,
      statusCode,
      stack: stack?.slice(0, MAX_TEXT_LENGTH),
      requestMethod,
      requestPath,
      accountId,
      correlationId,
      meta,
    });
  }
}
