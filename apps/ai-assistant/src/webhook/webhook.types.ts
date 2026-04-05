import { AssistantMessageDto } from '@app/ai-assistant/dto';

export type AssistantWebhookPayload =
  | {
      type: 'chat';
      sessionId: string;
      message: AssistantMessageDto;
    }
  | {
      type: 'outfit';
      sessionId: string;
      summary: string;
      wardrobeItemIds: number[];
      metadata?: Record<string, any>;
    };
