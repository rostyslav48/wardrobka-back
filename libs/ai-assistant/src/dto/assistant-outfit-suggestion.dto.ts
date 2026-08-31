import { Expose } from 'class-transformer';

export class AssistantOutfitSuggestionDto {
  @Expose()
  id: string;

  @Expose()
  sessionId: string;

  @Expose()
  messageId?: string;

  @Expose()
  summary: string;

  @Expose()
  wardrobeItemIds: number[];

  @Expose()
  createdAt: Date;
}
