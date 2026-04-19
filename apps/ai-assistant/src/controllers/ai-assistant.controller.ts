import { Body, Controller, UseFilters } from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';

import {
  ChatRequestDto,
  GenerateOutfitRequestDto,
  UpsertWebhookKeyDto,
} from '@app/ai-assistant/dto';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { RequestType } from '@app/common/types';

import { ConversationService } from '../services/conversation.service';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class AiAssistantController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(AI_ASSISTANT_REQUESTS.enqueueChat)
  async enqueueChat(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<ChatRequestDto>,
  ) {
    const result = await this.conversationService.handleChat(user.id, data);
    this.rmqService.ack(context);

    return result;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.enqueueOutfitSuggestion)
  async enqueueOutfit(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<GenerateOutfitRequestDto>,
  ) {
    const result = await this.conversationService.handleOutfitSuggestion(
      user.id,
      data,
    );
    this.rmqService.ack(context);

    return result;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.getSessions)
  async getSessions(
    @Ctx() context: RmqContext,
    @Body() { user }: RequestType<void>,
  ) {
    const sessions = await this.conversationService.getSessions(user.id);
    this.rmqService.ack(context);

    return sessions;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.getSessionMessages)
  async getSessionMessages(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<{ sessionId: string }>,
  ) {
    const messages = await this.conversationService.getSessionMessages(
      user.id,
      data.sessionId,
    );
    this.rmqService.ack(context);

    return messages;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.upsertWebhookKey)
  async upsertWebhookKey(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<UpsertWebhookKeyDto>,
  ) {
    const status = await this.conversationService.upsertWebhookKey(
      user.id,
      data.webhookKey,
    );
    this.rmqService.ack(context);

    return status;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.getRecentSuggestions)
  async getRecentSuggestions(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<{ limit?: number }>,
  ) {
    const suggestions = await this.conversationService.getRecentSuggestions(
      user.id,
      data?.limit,
    );
    this.rmqService.ack(context);

    return suggestions;
  }
}
