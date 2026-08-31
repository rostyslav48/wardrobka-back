import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Repository } from 'typeorm';

import { decryptProtectedData, encryptProtectedData } from '@app/common';
import { HttpService } from '@app/common/http';
import { GoogleCalendarCredentialEntity } from '@app/common/database/entities/calendar';

import {
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_TIMEOUT_MS,
  GOOGLE_TOKEN_URL,
} from './calendar.constants';
import { GoogleTokenService } from './google-token.service';

const SECRET = 'a-test-protected-data-secret';

const CONFIG: Record<string, string> = {
  PROTECTED_DATA_SECRET: SECRET,
  GOOGLE_OAUTH_CLIENT_ID: 'client-id-123.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-xyz',
};

const configService = {
  get: jest.fn((key: string) => CONFIG[key]),
  getOrThrow: jest.fn((key: string) => CONFIG[key]),
};

const cipher = (token: string) => encryptProtectedData({ token }, SECRET);

describe('GoogleTokenService', () => {
  let service: GoogleTokenService;
  let findOne: jest.Mock;
  let save: jest.Mock;
  let update: jest.Mock;
  let remove: jest.Mock;
  let httpPost: jest.Mock;

  const credential = (
    overrides: Partial<GoogleCalendarCredentialEntity> = {},
  ): GoogleCalendarCredentialEntity =>
    ({
      accountId: 42,
      refreshTokenEncrypted: cipher('rt-1'),
      accessTokenEncrypted: cipher('at-old'),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
      status: 'active',
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as GoogleCalendarCredentialEntity;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    findOne = jest.fn();
    save = jest.fn().mockResolvedValue(undefined);
    update = jest.fn().mockResolvedValue(undefined);
    remove = jest.fn().mockResolvedValue(undefined);
    httpPost = jest.fn();

    service = new GoogleTokenService(
      {
        findOne,
        save,
        update,
        delete: remove,
      } as unknown as Repository<GoogleCalendarCredentialEntity>,
      configService as never,
      { post: httpPost } as unknown as HttpService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('getStatus', () => {
    it.each([
      [null, 'disconnected'],
      [credential(), 'active'],
      [credential({ status: 'revoked' }), 'revoked'],
    ])('projects %#', async (row, expected) => {
      findOne.mockResolvedValue(row);
      await expect(service.getStatus(42)).resolves.toBe(expected);
    });
  });

  describe('storeCredential', () => {
    it('never writes a token in plaintext', async () => {
      await service.storeCredential({
        accountId: 42,
        refreshToken: 'rt-secret',
        accessToken: 'at-secret',
        expiresInSeconds: 3599,
        scope: 'scope-a',
      });

      const written = save.mock.calls[0][0];
      const serialized = JSON.stringify(written);
      expect(serialized).not.toContain('rt-secret');
      expect(serialized).not.toContain('at-secret');
      expect(written.status).toBe('active');
      expect(written.lastError).toBeNull();
      // Round-trips, so the ciphertext really is the token, not a hash.
      expect(
        decryptProtectedData<{ token: string }>(
          written.refreshTokenEncrypted,
          SECRET,
        ).token,
      ).toBe('rt-secret');
    });
  });

  describe('getAccessToken', () => {
    it('returns the stored token when it is comfortably unexpired', async () => {
      findOne.mockResolvedValue(
        credential({ accessTokenExpiresAt: new Date(Date.now() + 600_000) }),
      );

      await expect(service.getAccessToken(42)).resolves.toBe('at-old');
      expect(httpPost).not.toHaveBeenCalled();
    });

    it('refreshes inside the 60-second skew window and persists the new expiry', async () => {
      findOne.mockResolvedValue(
        // 30s of life left: still valid at Google, already stale to us.
        credential({ accessTokenExpiresAt: new Date(Date.now() + 30_000) }),
      );
      httpPost.mockReturnValue(of({ access_token: 'at-new', expires_in: 3599 }));

      const before = Date.now();
      await expect(service.getAccessToken(42)).resolves.toBe('at-new');

      const [url, body, options] = httpPost.mock.calls[0];
      expect(url).toBe(GOOGLE_TOKEN_URL);
      expect(body).toBeInstanceOf(URLSearchParams);
      expect(Object.fromEntries(body as URLSearchParams)).toEqual({
        client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: CONFIG.GOOGLE_OAUTH_CLIENT_SECRET,
        refresh_token: 'rt-1',
        grant_type: 'refresh_token',
      });
      expect(options).toEqual({ timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS });

      const patch = update.mock.calls[0][1];
      expect(patch.status).toBe('active');
      expect(patch.lastError).toBeNull();
      expect(JSON.stringify(patch)).not.toContain('at-new');
      expect(patch.accessTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 3599_000,
      );
    });

    it('refreshes when there is no access token at all', async () => {
      findOne.mockResolvedValue(
        credential({
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
        }),
      );
      httpPost.mockReturnValue(of({ access_token: 'at-new', expires_in: 3599 }));

      await expect(service.getAccessToken(42)).resolves.toBe('at-new');
    });

    it('marks the grant revoked and returns null on invalid_grant', async () => {
      findOne.mockResolvedValue(
        credential({ accessTokenExpiresAt: new Date(Date.now() - 1000) }),
      );
      httpPost.mockReturnValue(
        throwError(() => ({ status: 400, body: { error: 'invalid_grant' } })),
      );

      await expect(service.getAccessToken(42)).resolves.toBeNull();

      expect(update).toHaveBeenCalledWith(
        { accountId: 42 },
        {
          status: 'revoked',
          refreshTokenEncrypted: null,
          accessTokenEncrypted: null,
          accessTokenExpiresAt: null,
          lastError: 'invalid_grant',
        },
      );
    });

    it('returns null without revoking on a transient failure', async () => {
      findOne.mockResolvedValue(
        credential({ accessTokenExpiresAt: new Date(Date.now() - 1000) }),
      );
      httpPost.mockReturnValue(throwError(() => ({ status: 503, body: null })));

      await expect(service.getAccessToken(42)).resolves.toBeNull();
      expect(update).toHaveBeenCalledWith(
        { accountId: 42 },
        { lastError: 'refresh_failed' },
      );
    });

    it('returns null for a disconnected or revoked account without calling Google', async () => {
      findOne.mockResolvedValue(null);
      await expect(service.getAccessToken(42)).resolves.toBeNull();

      findOne.mockResolvedValue(credential({ status: 'revoked' }));
      await expect(service.getAccessToken(42)).resolves.toBeNull();

      expect(httpPost).not.toHaveBeenCalled();
    });

    it('never logs the refresh token or the client secret', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      findOne.mockResolvedValue(
        credential({ accessTokenExpiresAt: new Date(Date.now() - 1000) }),
      );
      httpPost.mockReturnValue(
        throwError(() => ({
          status: 400,
          body: { error: 'invalid_client', error_description: 'rt-1 rejected' },
        })),
      );

      await service.getAccessToken(42);

      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain('rt-1');
      expect(logged).not.toContain(CONFIG.GOOGLE_OAUTH_CLIENT_SECRET);
      expect(logged).toContain('invalid_client');
    });
  });

  describe('disconnect', () => {
    it('posts the refresh token to the revoke endpoint and deletes the row', async () => {
      findOne.mockResolvedValue(credential());
      httpPost.mockReturnValue(of({}));

      await service.disconnect(42);

      const [url, body, options] = httpPost.mock.calls[0];
      expect(url).toBe(GOOGLE_REVOKE_URL);
      expect(body).toBeInstanceOf(URLSearchParams);
      expect((body as URLSearchParams).get('token')).toBe('rt-1');
      expect(options).toEqual({ timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS });
      expect(remove).toHaveBeenCalledWith({ accountId: 42 });
    });

    it('deletes the row even when the revoke call rejects', async () => {
      findOne.mockResolvedValue(credential());
      httpPost.mockReturnValue(throwError(() => ({ status: 500, body: null })));

      await expect(service.disconnect(42)).resolves.toBeUndefined();
      expect(httpPost).toHaveBeenCalled();
      expect(remove).toHaveBeenCalledWith({ accountId: 42 });
    });

    it('is a no-op for an account that never connected', async () => {
      findOne.mockResolvedValue(null);

      await expect(service.disconnect(42)).resolves.toBeUndefined();
      expect(httpPost).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('still deletes the row when the stored token no longer decrypts', async () => {
      findOne.mockResolvedValue(
        credential({ refreshTokenEncrypted: 'not-valid-ciphertext' }),
      );

      await expect(service.disconnect(42)).resolves.toBeUndefined();
      expect(httpPost).not.toHaveBeenCalled();
      expect(remove).toHaveBeenCalledWith({ accountId: 42 });
    });
  });
});
