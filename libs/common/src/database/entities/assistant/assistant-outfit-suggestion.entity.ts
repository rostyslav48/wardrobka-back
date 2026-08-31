import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssistantSessionEntity } from './assistant-session.entity';
import { AssistantMessageEntity } from './assistant-message.entity';

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
  @JoinColumn({ name: 'session_id' })
  session: AssistantSessionEntity;

  /**
   * The assistant chat message this suggestion was proposed in reply to, so
   * the client can pair the two. Nullable — the outfit-generation path
   * (`handleOutfitSuggestion`) does not go through propose_outfit and leaves
   * this unset.
   */
  @Column({ name: 'message_id', nullable: true })
  messageId?: string;

  @ManyToOne(() => AssistantMessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'message_id' })
  message?: AssistantMessageEntity;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'wardrobe_item_ids', type: 'jsonb' })
  wardrobeItemIds: number[];

  @Column({ name: 'extra_metadata', type: 'jsonb', nullable: true })
  extraMetadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
