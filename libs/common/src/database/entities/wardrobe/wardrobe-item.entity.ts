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
  color: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 50 })
  season: string;

  @Column({ type: 'text', nullable: true })
  img_path?: string;

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

  // Generation state of the product image (pending | ready | failed).
  // Unrelated to `status` above — see the ImageStatus enum.
  @Column({ name: 'image_status', length: 20, default: 'ready' })
  image_status: string;

  // The tmp/ object a generation job reads from. Retained while the item is
  // `pending` and after a failure — that is what makes "Generate again" work
  // without re-picking the photo — and cleared once a generated image lands.
  @Column({ name: 'temp_image_key', length: 512, nullable: true })
  temp_image_key?: string | null;

  // When the current generation job was queued. The staleness sweep measures
  // this; the table carries no other timestamp.
  @Column({
    name: 'image_pending_since',
    type: 'timestamptz',
    nullable: true,
  })
  image_pending_since?: Date | null;
}
