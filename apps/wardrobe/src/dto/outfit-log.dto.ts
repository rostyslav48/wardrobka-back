import { Expose } from 'class-transformer';

export class OutfitLogDto {
  @Expose()
  id: string;

  @Expose()
  accountId: number;

  @Expose()
  date: string;

  @Expose()
  wardrobeItemIds: number[];

  @Expose()
  notes?: string;

  @Expose()
  createdAt: Date;
}
