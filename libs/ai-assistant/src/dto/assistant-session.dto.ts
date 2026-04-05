import { Expose, Type } from 'class-transformer';
import { AssistantMessageDto } from './assistant-message.dto';

export class AssistantSessionDto {
  @Expose()
  id: string;

  @Expose()
  topic: string;

  @Expose()
  createdAt: Date;

  @Expose()
  @Type(() => AssistantMessageDto)
  latestMessage?: AssistantMessageDto;
}
