import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssistantSessionEntity } from './assistant-session.entity';

@Entity({ name: 'assistant_outfit_suggestion' })
export class AssistantOutfitSuggestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @ManyToOne(
    () => AssistantSessionEntity,
    (session) => session.outfitSuggestions,
    {
      onDelete: 'CASCADE',
    },
  )
  session: AssistantSessionEntity;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'wardrobe_item_ids', type: 'jsonb' })
  wardrobeItemIds: number[];

  @Column({ name: 'extra_metadata', type: 'jsonb', nullable: true })
  extraMetadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
