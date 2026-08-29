import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import {
  ChatRequestDto,
  GenerateOutfitRequestDto,
  OutfitSuggestionsQueryDto,
  UpsertWebhookKeyDto,
} from '@app/ai-assistant/dto';
import { IsInt, IsOptional } from 'class-validator';
import { CurrentUser } from '@app/wardrobe-api-gateway/auth/decorators';
import { UserAccountPreview } from '@app/auth/users/types';

class RecentSuggestionsQuery {
  @IsOptional()
  @IsInt()
  limit?: number;
}

import { AiAssistantService } from './ai-assistant.service';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('chat')
  enqueueChat(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.enqueueChat(dto, user);
  }

  @Post('outfit')
  enqueueOutfit(
    @Body() dto: GenerateOutfitRequestDto,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.enqueueOutfitSuggestion(dto, user);
  }

  @Get('sessions')
  getSessions(@CurrentUser() user: UserAccountPreview) {
    return this.aiAssistantService.getSessions(user);
  }

  @Get('sessions/:sessionId/messages')
  getSessionMessages(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.getSessionMessages(sessionId, user);
  }

  @Put('webhook-key')
  upsertWebhookKey(
    @Body() dto: UpsertWebhookKeyDto,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.upsertWebhookKey(dto, user);
  }

  @Get('suggestions/recent')
  getRecentSuggestions(
    @Query() query: RecentSuggestionsQuery,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.getRecentSuggestions(query.limit, user);
  }

  @Get('outfit-suggestions')
  getOutfitSuggestions(
    @Query() query: OutfitSuggestionsQueryDto,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.getOutfitSuggestions(
      query.limit,
      query.offset,
      user,
    );
  }

  @Delete('outfit-suggestions/:id')
  deleteOutfitSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserAccountPreview,
  ) {
    return this.aiAssistantService.deleteOutfitSuggestion(id, user);
  }
}
