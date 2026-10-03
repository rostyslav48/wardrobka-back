import { RmqContext } from '@nestjs/microservices';

import { RmqService } from '@app/common';
import { RequestType } from '@app/common/types';

import { CalendarController } from './calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleTokenService } from './google-token.service';

describe('CalendarController disconnect', () => {
  let controller: CalendarController;
  let disconnect: jest.Mock;
  let invalidateAccount: jest.Mock;
  const context = {} as RmqContext;
  const user = { id: 7 } as RequestType<void>['user'];

  beforeEach(() => {
    disconnect = jest.fn().mockResolvedValue(undefined);
    invalidateAccount = jest.fn();

    controller = new CalendarController(
      {} as GoogleOAuthService,
      { disconnect } as unknown as GoogleTokenService,
      { invalidateAccount } as unknown as GoogleCalendarService,
      { ack: jest.fn() } as unknown as RmqService,
    );
  });

  it('invalidates the account cache after revoking the credential', async () => {
    const result = await controller.disconnect(context, {
      user,
      data: undefined,
    });

    expect(disconnect).toHaveBeenCalledWith(7);
    expect(invalidateAccount).toHaveBeenCalledWith(7);
    expect(result).toEqual({ status: 'disconnected' });

    // disconnect must run before the cache is dropped, not the other way round
    const disconnectOrder = disconnect.mock.invocationCallOrder[0];
    const invalidateOrder = invalidateAccount.mock.invocationCallOrder[0];
    expect(disconnectOrder).toBeLessThan(invalidateOrder);
  });
});
