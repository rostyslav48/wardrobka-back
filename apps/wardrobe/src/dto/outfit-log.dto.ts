import { Expose, Transform } from 'class-transformer';

export class OutfitLogDto {
  @Expose()
  id: string;

  @Expose()
  accountId: number;

  @Expose()
  @Transform(({ value }) => Number(value))
  date: number;

  @Expose()
  wardrobeItemIds: number[];

  @Expose()
  notes?: string;

  @Expose()
  createdAt: Date;
}
