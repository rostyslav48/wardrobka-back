import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import {
  ChatRequestDto,
  GenerateOutfitRequestDto,
  UpsertWebhookKeyDto,
} from '@app/ai-assistant/dto';

import { AiAssistantService } from './ai-assistant.service';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('chat')
  enqueueChat(@Body() dto: ChatRequestDto) {
    return this.aiAssistantService.enqueueChat(dto);
  }

  @Post('outfit')
  enqueueOutfit(@Body() dto: GenerateOutfitRequestDto) {
    return this.aiAssistantService.enqueueOutfitSuggestion(dto);
  }

  @Get('sessions')
  getSessions() {
    return this.aiAssistantService.getSessions();
  }

  @Get('sessions/:sessionId/messages')
  getSessionMessages(@Param('sessionId') sessionId: string) {
    return this.aiAssistantService.getSessionMessages(sessionId);
  }

  @Put('webhook-key')
  upsertWebhookKey(@Body() dto: UpsertWebhookKeyDto) {
    return this.aiAssistantService.upsertWebhookKey(dto);
  }
}
