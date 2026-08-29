import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserAccountEntity } from '../auth/user-account.entity';
import { AssistantMessageEntity } from './assistant-message.entity';
import { AssistantOutfitSuggestionEntity } from './assistant-outfit-suggestion.entity';

@Entity({ name: 'assistant_session' })
export class AssistantSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: number;

  @ManyToOne(() => UserAccountEntity, (account) => account.assistantSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account: UserAccountEntity;

  @Column({ length: 255 })
  topic: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => AssistantMessageEntity, (message) => message.session)
  messages: AssistantMessageEntity[];

  @OneToMany(() => AssistantOutfitSuggestionEntity, (outfit) => outfit.session)
  outfitSuggestions: AssistantOutfitSuggestionEntity[];
}
