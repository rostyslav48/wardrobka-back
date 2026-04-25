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
import { OutfitLogItemEntity } from './outfit-log-item.entity';

@Entity({ name: 'outfit_log' })
export class OutfitLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id' })
  accountId: number;

  @ManyToOne(() => UserAccountEntity, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'account_id' })
  account: UserAccountEntity;

  @Column({ type: 'timestamptz' })
  date: Date;

  @OneToMany(() => OutfitLogItemEntity, (item) => item.outfitLog)
  items: OutfitLogItemEntity[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
