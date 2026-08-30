import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ErrorLogSeverity = 'warn' | 'error' | 'fatal';

@Entity({ name: 'error_log' })
@Index('IDX_error_log_severity_created', ['severity', 'createdAt'])
@Index('IDX_error_log_service_created', ['service', 'createdAt'])
export class ErrorLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20 })
  severity: ErrorLogSeverity;

  @Column({ length: 50 })
  service: string;

  @Column({ length: 200, nullable: true })
  context?: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'error_name' })
  errorName?: string;

  @Column({ type: 'int', nullable: true, name: 'status_code' })
  statusCode?: number;

  @Column({ type: 'text', nullable: true })
  stack?: string;

  @Column({
    type: 'varchar',
    length: 10,
    nullable: true,
    name: 'request_method',
  })
  requestMethod?: string;

  @Column({ type: 'text', nullable: true, name: 'request_path' })
  requestPath?: string;

  @Column({ type: 'int', nullable: true, name: 'account_id' })
  accountId?: number;

  @Column({
    type: 'varchar',
    length: 36,
    nullable: true,
    name: 'correlation_id',
  })
  correlationId?: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
