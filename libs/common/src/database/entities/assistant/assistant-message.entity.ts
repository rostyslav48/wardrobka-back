import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssistantSessionEntity } from './assistant-session.entity';

@Entity({ name: 'assistant_message' })
export class AssistantMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(() => AssistantSessionEntity, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  session: AssistantSessionEntity;

  @Column({ length: 20 })
  role: 'user' | 'assistant' | 'system';

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments?: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
