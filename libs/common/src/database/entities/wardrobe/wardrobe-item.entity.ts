import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserAccountEntity } from '../auth/user-account.entity';

@Entity({ name: 'wardrobe_item' })
export class WardrobeItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'account_id' })
  accountId: number;

  @ManyToOne(() => UserAccountEntity, (account) => account.wardrobeItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account: UserAccountEntity;

  @Column({ length: 50 })
  type: string;

  @Column({ length: 50 })
  color: string; // HEX format for color sorting

  @Column({ length: 50 })
  name: string;

  @Column({ length: 50 })
  season: string;

  @Column({ type: 'text', nullable: true })
  img_url?: string; // Store in cloud, CDN, or local storage

  @Column({
    length: 50,
    default: 'active',
  })
  status: string;

  @Column({ default: false })
  favourite: boolean;

  @Column({
    length: 50,
    nullable: true,
  })
  fit_type?: string;

  @Column({ length: 100, nullable: true })
  material?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 100, nullable: true })
  style?: string;

  @Column({ length: 20, nullable: true })
  size?: string;

  @Column({ length: 100, nullable: true })
  brand?: string;
}
