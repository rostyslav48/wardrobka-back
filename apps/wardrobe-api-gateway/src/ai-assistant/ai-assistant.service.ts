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
import { UserAccountPreview } from '@app/auth/users/types';

@Injectable()
export class AiAssistantService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE)
    private readonly aiClient: ClientProxyService,
  ) {}

  enqueueChat(dto: ChatRequestDto, user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.enqueueChat, dto, user),
    );
  }

  enqueueOutfitSuggestion(
    dto: GenerateOutfitRequestDto,
    user: UserAccountPreview,
  ) {
    return firstValueFrom(
      this.aiClient.send(
        AI_ASSISTANT_REQUESTS.enqueueOutfitSuggestion,
        dto,
        user,
      ),
    );
  }

  getSessions(user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.getSessions, undefined, user),
    );
  }

  getSessionMessages(sessionId: string, user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(
        AI_ASSISTANT_REQUESTS.getSessionMessages,
        { sessionId },
        user,
      ),
    );
  }

  upsertWebhookKey(dto: UpsertWebhookKeyDto, user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(AI_ASSISTANT_REQUESTS.upsertWebhookKey, dto, user),
    );
  }

  getRecentSuggestions(limit: number | undefined, user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(
        AI_ASSISTANT_REQUESTS.getRecentSuggestions,
        { limit },
        user,
      ),
    );
  }

  getOutfitSuggestions(
    limit: number | undefined,
    offset: number | undefined,
    user: UserAccountPreview,
  ) {
    return firstValueFrom(
      this.aiClient.send(
        AI_ASSISTANT_REQUESTS.getOutfitSuggestions,
        { limit, offset },
        user,
      ),
    );
  }

  deleteOutfitSuggestion(id: string, user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(
        AI_ASSISTANT_REQUESTS.deleteOutfitSuggestion,
        { id },
        user,
      ),
    );
  }
}
