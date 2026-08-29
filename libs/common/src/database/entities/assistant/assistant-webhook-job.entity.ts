import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AssistantWebhookJobStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed';

@Entity({ name: 'assistant_webhook_job' })
@Index('IDX_assistant_webhook_status_schedule', ['status', 'scheduledAt'])
export class AssistantWebhookJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: number;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ length: 20, default: 'pending' })
  status: AssistantWebhookJobStatus;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string;

  @Column({
    type: 'timestamp with time zone',
    name: 'scheduled_at',
    nullable: true,
  })
  scheduledAt?: Date;

  @Column({
    type: 'timestamp with time zone',
    name: 'processed_at',
    nullable: true,
  })
  processedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
