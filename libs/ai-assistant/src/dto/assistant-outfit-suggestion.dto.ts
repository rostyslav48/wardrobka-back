import { Expose, Transform } from 'class-transformer';

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

  // Read from extraMetadata.proposed. Undefined on rows written before this
  // flag existed — a missing key means unknown/legacy, not "not proposed".
  @Expose()
  @Transform(({ obj }) => obj.extraMetadata?.proposed, { toClassOnly: true })
  proposed?: boolean;

  @Expose()
  createdAt: Date;
}
