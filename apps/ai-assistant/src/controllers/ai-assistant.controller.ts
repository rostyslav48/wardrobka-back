import {
  BadRequestException,
  Body,
  Controller,
  UseFilters,
} from '@nestjs/common';
import { Ctx, MessagePattern, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  AnalyzeImageRequestDto,
  AnalyzedImageAttributesDto,
  ChatRequestDto,
  GenerateOutfitRequestDto,
  UpsertWebhookKeyDto,
} from '@app/ai-assistant/dto';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { MicroserviceExceptionFilter, RmqService } from '@app/common';
import { RequestType } from '@app/common/types';

import { ConversationService } from '../services/conversation.service';
import { ImageAnalyzerService } from '../services/image-analyzer.service';

@UseFilters(MicroserviceExceptionFilter)
@Controller()
export class AiAssistantController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly imageAnalyzerService: ImageAnalyzerService,
    private readonly rmqService: RmqService,
  ) {}

  @MessagePattern(AI_ASSISTANT_REQUESTS.analyzeImage)
  async analyzeImage(
    @Ctx() context: RmqContext,
    // Not destructured here on purpose: `RequestType<AnalyzeImageRequestDto>`
    // is a generic alias, so its runtime metatype is Object and the global
    // ValidationPipe skips it entirely, and if the whole envelope is missing
    // a destructured `{ data }` param throws before the handler body ever
    // runs. Both a malformed and a wholly-absent payload must reach the
    // explicit validation below and come out as an HttpException, so
    // MicroserviceExceptionFilter acks it instead of leaving a poison
    // message to be redelivered (and re-billed against Gemini) forever.
    @Body() body: RequestType<AnalyzeImageRequestDto>,
  ) {
    const data = body?.data;
    await this.validateAnalyzeImageRequest(data);

    const attributes = await this.imageAnalyzerService.analyze(
      data.fileBase64,
      data.mimeType,
    );
    this.rmqService.ack(context);

    return plainToInstance(AnalyzedImageAttributesDto, attributes, {
      excludeExtraneousValues: true,
    });
  }

  private async validateAnalyzeImageRequest(
    data: AnalyzeImageRequestDto,
  ): Promise<void> {
    const instance = plainToInstance(AnalyzeImageRequestDto, data ?? {});
    const errors = await validate(instance);
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
  }

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

  @MessagePattern(AI_ASSISTANT_REQUESTS.getOutfitSuggestions)
  async getOutfitSuggestions(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<{ limit?: number; offset?: number }>,
  ) {
    const suggestions = await this.conversationService.getOutfitSuggestions(
      user.id,
      data?.limit,
      data?.offset,
    );
    this.rmqService.ack(context);

    return suggestions;
  }

  @MessagePattern(AI_ASSISTANT_REQUESTS.deleteOutfitSuggestion)
  async deleteOutfitSuggestion(
    @Ctx() context: RmqContext,
    @Body() { user, data }: RequestType<{ id: string }>,
  ) {
    await this.conversationService.deleteOutfitSuggestion(user.id, data.id);
    this.rmqService.ack(context);

    return { deleted: true };
  }
}
