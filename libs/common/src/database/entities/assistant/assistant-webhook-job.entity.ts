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
@Index(['status', 'scheduledAt'])
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
