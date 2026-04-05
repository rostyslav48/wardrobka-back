import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WardrobeItemEntity } from '../wardrobe/wardrobe-item.entity';
import { AssistantSessionEntity } from '../assistant/assistant-session.entity';

@Unique(['email'])
@Entity({ name: 'user_account' })
export class UserAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => WardrobeItemEntity, (wardrobeItem) => wardrobeItem.account)
  wardrobeItems: WardrobeItemEntity;

  @OneToMany(() => AssistantSessionEntity, (session) => session.account)
  assistantSessions: AssistantSessionEntity[];

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  email: string;

  @Column({ type: 'text' })
  password: string;

  @Column({ type: 'text', nullable: true, name: 'protected_data' })
  protectedData?: string;
}
