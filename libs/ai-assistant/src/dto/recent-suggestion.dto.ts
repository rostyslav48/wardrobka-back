import { Expose } from 'class-transformer';

export class RecentSuggestionDto {
  @Expose()
  id: string;

  @Expose()
  sessionId: string;

  @Expose()
  sessionTopic: string;

  @Expose()
  summary: string;

  @Expose()
  wardrobeItemIds: number[];

  @Expose()
  createdAt: Date;
}
