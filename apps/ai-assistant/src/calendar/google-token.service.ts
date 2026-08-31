import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';

import { HttpService } from '@app/common/http';
import { decryptProtectedData, encryptProtectedData } from '@app/common';
import { GoogleCalendarCredentialEntity } from '@app/common/database/entities/calendar';

import {
  ACCESS_TOKEN_SKEW_MS,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_TIMEOUT_MS,
  GOOGLE_TOKEN_URL,
} from './calendar.constants';
import { CalendarStatus, GoogleTokenResponse } from './calendar.types';

export interface StoreCredentialInput {
  accountId: number;
  refreshToken: string;
  accessToken?: string;
  expiresInSeconds?: number;
  scope?: string;
}

/**
 * Owns everything that touches a stored Google credential: the encrypted
 * at-rest representation, refresh, revocation and the status projection.
 *
 * Nothing in here ever logs a token, a code or the client secret — only the
 * account id and Google's own error *code*.
 */
@Injectable()
export class GoogleTokenService {
  private readonly logger = new Logger(GoogleTokenService.name);

  constructor(
    @InjectRepository(GoogleCalendarCredentialEntity)
    private readonly credentialRepository: Repository<GoogleCalendarCredentialEntity>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async getStatus(accountId: number): Promise<CalendarStatus> {
    const credential = await this.credentialRepository.findOne({
      where: { accountId },
    });

    if (!credential) {
      return 'disconnected';
    }

    return credential.status === 'revoked' ? 'revoked' : 'active';
  }

  async storeCredential(input: StoreCredentialInput): Promise<void> {
    const { accountId, refreshToken, accessToken, expiresInSeconds, scope } =
      input;

    await this.credentialRepository.save({
      accountId,
      refreshTokenEncrypted: this.encrypt(refreshToken),
      accessTokenEncrypted: accessToken ? this.encrypt(accessToken) : null,
      accessTokenExpiresAt: this.expiryFrom(expiresInSeconds),
      scope: scope ?? null,
      status: 'active',
      lastError: null,
    });
  }

  /**
   * The access token for `accountId`, refreshing it first when it is inside
   * the skew window. Returns null — never throws — when the account is not
   * connected, the grant is dead, or Google could not be reached: a broken
   * calendar must not fail the chat that asked for it.
   */
  async getAccessToken(accountId: number): Promise<string | null> {
    const credential = await this.credentialRepository.findOne({
      where: { accountId },
    });

    if (!credential || credential.status !== 'active') {
      return null;
    }

    const expiresAt = credential.accessTokenExpiresAt
      ? new Date(credential.accessTokenExpiresAt).getTime()
      : 0;

    if (
      credential.accessTokenEncrypted &&
      expiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS
    ) {
      const cached = this.decrypt(credential.accessTokenEncrypted);
      if (cached) {
        return cached;
      }
    }

    return this.refresh(credential);
  }

  /**
   * Revokes the grant at Google and drops the row. The delete happens even
   * when the revoke call fails — a credential we can no longer use must not
   * survive as a row that reports the user as connected. Idempotent: an
   * account that never connected is a no-op.
   */
  async disconnect(accountId: number): Promise<void> {
    const credential = await this.credentialRepository.findOne({
      where: { accountId },
    });

    if (!credential) {
      return;
    }

    const refreshToken = this.decrypt(credential.refreshTokenEncrypted);

    if (refreshToken) {
      await this.revokeToken(refreshToken, accountId);
    }

    await this.credentialRepository.delete({ accountId });
  }

  /** Best-effort revoke; a failure is logged and swallowed. */
  async revokeToken(token: string, accountId: number): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          GOOGLE_REVOKE_URL,
          new URLSearchParams({ token }),
          { timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS },
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Google token revoke failed for account ${accountId}: ${this.describe(
          error,
        )}`,
      );
    }
  }

  private async refresh(
    credential: GoogleCalendarCredentialEntity,
  ): Promise<string | null> {
    const accountId = credential.accountId;
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    const refreshToken = this.decrypt(credential.refreshTokenEncrypted);

    if (!clientId || !clientSecret) {
      this.logger.warn(
        `Google Calendar is not configured; cannot refresh account ${accountId}`,
      );
      return null;
    }

    if (!refreshToken) {
      await this.markRevoked(accountId, 'missing_refresh_token');
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<GoogleTokenResponse>(
          GOOGLE_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
          { timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS },
        ),
      );

      if (!response?.access_token) {
        await this.recordError(accountId, 'no_access_token');
        return null;
      }

      await this.credentialRepository.update(
        { accountId },
        {
          accessTokenEncrypted: this.encrypt(response.access_token),
          accessTokenExpiresAt: this.expiryFrom(response.expires_in),
          status: 'active',
          lastError: null,
        },
      );

      return response.access_token;
    } catch (error) {
      const code = this.errorCode(error);

      // invalid_grant is terminal: the user revoked the grant in their Google
      // account, or it expired. Retrying can never succeed, so the row is
      // emptied and marked rather than left looking connected.
      if (code === 'invalid_grant') {
        await this.markRevoked(accountId, code);
        return null;
      }

      this.logger.warn(
        `Google token refresh failed for account ${accountId}: ${this.describe(
          error,
        )}`,
      );
      await this.recordError(accountId, code ?? 'refresh_failed');
      return null;
    }
  }

  private async markRevoked(accountId: number, reason: string): Promise<void> {
    await this.credentialRepository.update(
      { accountId },
      {
        status: 'revoked',
        refreshTokenEncrypted: null,
        accessTokenEncrypted: null,
        accessTokenExpiresAt: null,
        lastError: reason,
      },
    );
    this.logger.warn(
      `Google Calendar grant for account ${accountId} is no longer usable: ${reason}`,
    );
  }

  private async recordError(accountId: number, reason: string): Promise<void> {
    await this.credentialRepository.update({ accountId }, { lastError: reason });
  }

  private expiryFrom(expiresInSeconds?: number): Date | null {
    if (!expiresInSeconds || !Number.isFinite(expiresInSeconds)) {
      return null;
    }
    return new Date(Date.now() + expiresInSeconds * 1000);
  }

  private encrypt(token: string): string {
    return encryptProtectedData({ token }, this.secret());
  }

  private decrypt(ciphertext?: string | null): string | null {
    if (!ciphertext) {
      return null;
    }
    try {
      const payload = decryptProtectedData<{ token: string }>(
        ciphertext,
        this.secret(),
      );
      return payload?.token ?? null;
    } catch {
      // A ciphertext that no longer decrypts (rotated secret, corrupt row) is
      // indistinguishable from no token at all as far as callers care.
      return null;
    }
  }

  private secret(): string {
    return this.configService.getOrThrow<string>('PROTECTED_DATA_SECRET');
  }

  /** Google's machine-readable error code, or null. Never the description. */
  private errorCode(error: unknown): string | null {
    const body = (error as { body?: unknown })?.body;
    const code = (body as { error?: unknown })?.error;
    return typeof code === 'string' ? code : null;
  }

  /** Status + error code only — response bodies can echo the submitted token. */
  private describe(error: unknown): string {
    const status = (error as { status?: number })?.status;
    const code = this.errorCode(error);
    return `status=${status ?? 'n/a'} error=${code ?? 'unknown'}`;
  }
}
