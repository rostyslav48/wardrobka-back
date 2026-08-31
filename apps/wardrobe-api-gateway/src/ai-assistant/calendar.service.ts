import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom, timeout } from 'rxjs';

import {
  CALENDAR_CALLBACK_TIMEOUT_MS,
  CALENDAR_REQUESTS,
} from '@app/ai-assistant/constants';
import { UserAccountPreview } from '@app/auth/users/types';

import { CLIENT_PROXY_SERVICE } from '../constants';
import { ClientProxyService } from '../services/client-proxy.service';

export interface CalendarCallbackQuery {
  code?: string;
  state?: string;
  scope?: string;
  error?: string;
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(CLIENT_PROXY_SERVICE)
    private readonly aiClient: ClientProxyService,
  ) {}

  getAuthUrl(user: UserAccountPreview): Promise<{ url: string }> {
    return firstValueFrom(
      this.aiClient.send(CALENDAR_REQUESTS.getAuthUrl, undefined, user),
    );
  }

  // No user: Google's browser arrives here unauthenticated and the signed
  // `state` carries the account id.
  //
  // Bounded: a send() to a queue whose consumer is down never emits and never
  // errors, so the controller's catch — and with it the fallback redirect —
  // only fires if the wait is capped here.
  handleCallback(
    query: CalendarCallbackQuery,
  ): Promise<{ redirectUrl: string }> {
    return firstValueFrom(
      this.aiClient
        .send(CALENDAR_REQUESTS.handleCallback, query)
        .pipe(timeout(CALENDAR_CALLBACK_TIMEOUT_MS)),
    );
  }

  getStatus(user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(CALENDAR_REQUESTS.getStatus, undefined, user),
    );
  }

  disconnect(user: UserAccountPreview) {
    return firstValueFrom(
      this.aiClient.send(CALENDAR_REQUESTS.disconnect, undefined, user),
    );
  }

  getOccasions(user: UserAccountPreview, daysAhead?: number) {
    return firstValueFrom(
      this.aiClient.send(CALENDAR_REQUESTS.getOccasions, { daysAhead }, user),
    );
  }
}
