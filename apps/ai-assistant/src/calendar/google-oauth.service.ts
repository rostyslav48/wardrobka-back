import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';

import { HttpService } from '@app/common/http';

import {
  DEFAULT_APP_REDIRECT,
  GOOGLE_AUTH_URL,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_TOKEN_TIMEOUT_MS,
  GOOGLE_TOKEN_URL,
  STATE_PREFIX,
  STATE_TTL_MS,
} from './calendar.constants';
import {
  CalendarCallbackResponse,
  CalendarCallbackStatus,
  GoogleTokenResponse,
} from './calendar.types';
import { GoogleTokenService } from './google-token.service';

export interface CallbackParams {
  code?: string;
  state?: string;
  scope?: string;
  error?: string;
}

interface StatePayload {
  a: number;
  e: number;
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly tokenService: GoogleTokenService,
  ) {}

  buildAuthUrl(accountId: number): string {
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const redirectUri = this.configService.get<string>(
      'GOOGLE_OAUTH_REDIRECT_URI',
    );

    if (!clientId || !redirectUri) {
      throw new ServiceUnavailableException(
        'Google Calendar integration is not configured',
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPE,
      // offline alone is not enough: without prompt=consent a reconnect comes
      // back with no refresh_token and stores a credential that can never be
      // refreshed.
      access_type: 'offline',
      prompt: 'consent',
      state: this.mintState(accountId),
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * HMAC-SHA256 over `{ a: accountId, e: expiryEpochMs }` with a `gcal-state:`
   * domain prefix. Deliberately not a JWT signed by the gateway's JwtService:
   * that token would be accepted by the global AuthGuard as a bearer
   * credential.
   */
  mintState(accountId: number): string {
    const payload: StatePayload = { a: accountId, e: Date.now() + STATE_TTL_MS };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );

    return `${encoded}.${this.sign(encoded)}`;
  }

  /** The minting account id, or null if the state is absent, tampered with, signed with another secret, or expired. */
  verifyState(state?: string): number | null {
    if (!state) {
      return null;
    }

    const separator = state.indexOf('.');
    if (separator <= 0) {
      return null;
    }

    const encoded = state.slice(0, separator);
    const signature = state.slice(separator + 1);

    if (!this.signatureMatches(encoded, signature)) {
      return null;
    }

    let payload: StatePayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as StatePayload;
    } catch {
      return null;
    }

    if (
      typeof payload?.a !== 'number' ||
      typeof payload?.e !== 'number' ||
      payload.e <= Date.now()
    ) {
      return null;
    }

    return payload.a;
  }

  /**
   * Every outcome, success or failure, is a redirect back into the app. Inside
   * ASWebAuthenticationSession an HTML page is a dead end with no back button.
   */
  async handleCallback(
    params: CallbackParams,
  ): Promise<CalendarCallbackResponse> {
    const status = await this.resolveCallback(params);
    return { status, redirectUrl: this.buildRedirectUrl(status) };
  }

  buildRedirectUrl(status: CalendarCallbackStatus): string {
    // Server config, never a client-supplied parameter — accepting one here
    // would make a public endpoint an open redirect.
    const base =
      this.configService.get<string>('GOOGLE_OAUTH_APP_REDIRECT') ||
      DEFAULT_APP_REDIRECT;
    const separator = base.includes('?') ? '&' : '?';

    return `${base}${separator}status=${status}`;
  }

  private async resolveCallback(
    params: CallbackParams,
  ): Promise<CalendarCallbackStatus> {
    const { code, state, scope, error } = params;

    if (error) {
      this.logger.warn(`Google OAuth callback returned error=${error}`);
      return error === 'access_denied' ? 'denied' : 'error';
    }

    const accountId = this.verifyState(state);
    if (accountId === null) {
      this.logger.warn('Google OAuth callback rejected: invalid state');
      return 'error';
    }

    if (!code) {
      this.logger.warn(
        `Google OAuth callback for account ${accountId} carried no code`,
      );
      return 'error';
    }

    // Google echoes the granted scopes on the callback. Checking here means a
    // partial grant never reaches the token exchange at all.
    if (scope !== undefined && !this.grantsCalendarScope(scope)) {
      this.logger.warn(
        `Google OAuth callback for account ${accountId} omitted the calendar scope`,
      );
      return 'scope_denied';
    }

    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    const redirectUri = this.configService.get<string>(
      'GOOGLE_OAUTH_REDIRECT_URI',
    );

    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn(
        'Google OAuth callback arrived but the integration is not configured',
      );
      return 'error';
    }

    let tokens: GoogleTokenResponse;
    try {
      tokens = await firstValueFrom(
        this.httpService.post<GoogleTokenResponse>(
          GOOGLE_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
          { timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS },
        ),
      );
    } catch (err) {
      this.logger.warn(
        `Google token exchange failed for account ${accountId}: status=${
          (err as { status?: number })?.status ?? 'n/a'
        }`,
      );
      return 'error';
    }

    const grantedScope = tokens?.scope;
    if (grantedScope !== undefined && !this.grantsCalendarScope(grantedScope)) {
      this.logger.warn(
        `Google token exchange for account ${accountId} granted no calendar scope`,
      );
      // Nothing is stored, so hand the grant straight back rather than leaving
      // a live token this service can never use again.
      if (tokens.access_token) {
        await this.tokenService.revokeToken(tokens.access_token, accountId);
      }
      return 'scope_denied';
    }

    if (!tokens?.refresh_token) {
      this.logger.warn(
        `Google token exchange for account ${accountId} returned no refresh token`,
      );
      return 'error';
    }

    await this.tokenService.storeCredential({
      accountId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresInSeconds: tokens.expires_in,
      scope: grantedScope ?? scope,
    });

    return 'ok';
  }

  private grantsCalendarScope(scope: string): boolean {
    return scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE);
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.secret())
      .update(`${STATE_PREFIX}${encoded}`)
      .digest('base64url');
  }

  private signatureMatches(encoded: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(encoded), 'utf8');
    const actual = Buffer.from(signature, 'utf8');

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private secret(): string {
    return this.configService.getOrThrow<string>('PROTECTED_DATA_SECRET');
  }
}
