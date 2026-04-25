import { Expose, Transform } from 'class-transformer';

export class OutfitLogDto {
  @Expose()
  id: string;

  @Expose()
  accountId: number;

  @Expose()
  @Transform(({ value }) => (value instanceof Date ? value.getTime() : value))
  date: number;

  @Expose()
  wardrobeItemIds: number[];

  @Expose()
  notes?: string;

  @Expose()
  createdAt: Date;
}
