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

  async create(payload: CreateErrorLogDto): Promise<ErrorLogEntity> {
    const errorLog = this.errorLogRepository.create({
      ...payload,
      message: payload.message.slice(0, MAX_TEXT_LENGTH),
      stack: payload.stack?.slice(0, MAX_TEXT_LENGTH),
    });

    return this.errorLogRepository.save(errorLog);
  }
}
