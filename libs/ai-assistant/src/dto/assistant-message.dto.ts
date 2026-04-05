import { Expose } from 'class-transformer';

export class AssistantMessageDto {
  @Expose()
  id: string;

  @Expose()
  role: 'user' | 'assistant' | 'system';

  @Expose()
  content: string;

  @Expose()
  attachments?: string[];

  @Expose()
  createdAt: Date;
}
