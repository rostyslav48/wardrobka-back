import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WardrobeItemEntity } from '../wardrobe/wardrobe-item.entity';

@Unique(['email'])
@Entity({ name: 'user_account' })
export class UserAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToMany(() => WardrobeItemEntity, (wardrobeItem) => wardrobeItem.account)
  wardrobeItems: WardrobeItemEntity;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  email: string;

  @Column({ type: 'text' })
  password: string;
}
