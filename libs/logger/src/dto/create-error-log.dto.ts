import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { ErrorLogSeverity } from '../types';

const ERROR_LOG_SEVERITIES: ErrorLogSeverity[] = ['warn', 'error', 'fatal'];

export class CreateErrorLogDto {
  @IsIn(ERROR_LOG_SEVERITIES)
  severity: ErrorLogSeverity;

  @IsString()
  @MaxLength(50)
  service: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  context?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  errorName?: string;

  @IsOptional()
  @IsInt()
  statusCode?: number;

  @IsOptional()
  @IsString()
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  requestMethod?: string;

  @IsOptional()
  @IsString()
  requestPath?: string;

  @IsOptional()
  @IsInt()
  accountId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  correlationId?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}
