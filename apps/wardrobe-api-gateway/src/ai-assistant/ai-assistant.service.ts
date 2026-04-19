import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import {
  ChatRequestDto,
  GenerateOutfitRequestDto,
  UpsertWebhookKeyDto,
} from '@app/ai-assistant/dto';
import { AI_ASSISTANT_REQUESTS } from '@app/ai-assistant/constants';
import { CLIENT_PROXY_SERVICE } from '../constants';
import { ClientProxyService } from '../services/client-proxy.service';

@Injectable()
export class AiAssistantService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE)
    private readonly aiClient: ClientProxyService,
  ) {}

  enqueueChat(dto: ChatRequestDto) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.enqueueChat, dto),
    );
  }

  enqueueOutfitSuggestion(dto: GenerateOutfitRequestDto) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.enqueueOutfitSuggestion, dto),
    );
  }

  getSessions() {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.getSessions, undefined),
    );
  }

  getSessionMessages(sessionId: string) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.getSessionMessages, {
        sessionId,
      }),
    );
  }

  upsertWebhookKey(dto: UpsertWebhookKeyDto) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.upsertWebhookKey, dto),
    );
  }

  getRecentSuggestions(limit?: number) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.getRecentSuggestions, {
        limit,
      }),
    );
  }
}
