import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { OutfitLogEntity } from './outfit-log.entity';

@Entity({ name: 'outfit_log_item' })
export class OutfitLogItemEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'outfit_log_id', type: 'uuid' })
  outfitLogId: string;

  @ManyToOne(() => OutfitLogEntity, (log) => log.items, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'outfit_log_id' })
  outfitLog: OutfitLogEntity;

  @Column({ name: 'wardrobe_item_id' })
  wardrobeItemId: number;
}
