import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { NEVER, of, throwError } from 'rxjs';

import {
  CALENDAR_CALLBACK_TIMEOUT_MS,
  CALENDAR_FALLBACK_APP_REDIRECT,
  CALENDAR_REQUESTS,
} from '@app/ai-assistant/constants';
import { UserAccountPreview } from '@app/auth/users/types';

import { ClientProxyService } from '../services/client-proxy.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

const FALLBACK = `${CALENDAR_FALLBACK_APP_REDIRECT}?status=error`;

describe('CalendarController callback', () => {
  let send: jest.Mock;
  let controller: CalendarController;
  let res: Response;
  let redirect: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    send = jest.fn();
    controller = new CalendarController(
      new CalendarService({ send } as unknown as ClientProxyService),
    );
    redirect = jest.fn();
    res = { redirect } as unknown as Response;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('redirects to the URL ai-assistant resolved', async () => {
    send.mockReturnValue(
      of({
        redirectUrl: 'wardrobeassistantfront://calendar-connected?status=ok',
      }),
    );

    await controller.handleCallback(res, 'the-code', 'the-state', 'the-scope');

    expect(redirect).toHaveBeenCalledWith(
      302,
      'wardrobeassistantfront://calendar-connected?status=ok',
    );
  });

  it('redirects to the fallback when the round trip rejects', async () => {
    send.mockReturnValue(throwError(() => new Error('channel closed')));

    await controller.handleCallback(res, 'the-code', 'the-state');

    expect(redirect).toHaveBeenCalledWith(302, FALLBACK);
  });

  // An RMQ send() to a queue with no consumer neither emits nor errors. Without
  // a timeout in CalendarService the browser would hang here instead of being
  // sent back into the app.
  it('redirects to the fallback when ai-assistant never replies', async () => {
    jest.useFakeTimers();
    send.mockReturnValue(NEVER);

    const pending = controller.handleCallback(res, 'the-code', 'the-state');
    expect(redirect).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(CALENDAR_CALLBACK_TIMEOUT_MS + 1);
    await pending;

    expect(redirect).toHaveBeenCalledWith(302, FALLBACK);
  });
});

describe('CalendarController occasions', () => {
  const user = { id: 1 } as UserAccountPreview;

  it('forwards the days query param to the microservice call', async () => {
    const send = jest
      .fn()
      .mockReturnValue(of({ status: 'connected', occasions: [] }));
    const controller = new CalendarController(
      new CalendarService({ send } as unknown as ClientProxyService),
    );

    const result = await controller.getOccasions({ days: 3 }, user);

    expect(send).toHaveBeenCalledWith(
      CALENDAR_REQUESTS.getOccasions,
      { daysAhead: 3 },
      user,
    );
    expect(result).toEqual({ status: 'connected', occasions: [] });
  });
});
