import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * A bare ThrottlerGuard throws 'ThrottlerException: Too Many Requests', which
 * is accurate but reads like a stack trace rather than something a user did
 * anything about. Every route that guards a paid AI call should read like it
 * expects to be hit occasionally, not like an error state.
 */
@Injectable()
export class FriendlyThrottlerGuard extends ThrottlerGuard {
  protected errorMessage =
    "You're doing that a bit too fast — please wait a few seconds and try again.";
}
