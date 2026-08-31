import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { HttpService } from '@app/common/http';

import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_TOKEN_TIMEOUT_MS,
  GOOGLE_TOKEN_URL,
  STATE_TTL_MS,
} from './calendar.constants';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleTokenService } from './google-token.service';

const SECRET = 'a-test-protected-data-secret';

const CONFIG: Record<string, string> = {
  PROTECTED_DATA_SECRET: SECRET,
  GOOGLE_OAUTH_CLIENT_ID: 'client-id-123.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-xyz',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/calendar/google/callback',
  GOOGLE_OAUTH_APP_REDIRECT: 'wardrobeassistantfront://calendar-connected',
};

const buildConfig = (overrides: Record<string, string> = {}) => {
  const values = { ...CONFIG, ...overrides };
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (values[key] === undefined) throw new Error(`missing ${key}`);
      return values[key];
    }),
  };
};

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  let httpPost: jest.Mock;
  let storeCredential: jest.Mock;
  let revokeToken: jest.Mock;
  let tokenService: GoogleTokenService;

  const build = (overrides: Record<string, string> = {}) => {
    httpPost = jest.fn();
    storeCredential = jest.fn().mockResolvedValue(undefined);
    revokeToken = jest.fn().mockResolvedValue(undefined);
    tokenService = { storeCredential, revokeToken } as unknown as GoogleTokenService;

    return new GoogleOAuthService(
      buildConfig(overrides) as never,
      { post: httpPost } as unknown as HttpService,
      tokenService,
    );
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('buildAuthUrl', () => {
    it('carries the configured client, redirect and the exact readonly scope', () => {
      const url = new URL(service.buildAuthUrl(7));
      const params = url.searchParams;

      expect(`${url.origin}${url.pathname}`).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(params.get('client_id')).toBe(CONFIG.GOOGLE_OAUTH_CLIENT_ID);
      expect(params.get('redirect_uri')).toBe(
        CONFIG.GOOGLE_OAUTH_REDIRECT_URI,
      );
      expect(params.get('response_type')).toBe('code');
      expect(params.get('scope')).toBe(
        'https://www.googleapis.com/auth/calendar.events.readonly',
      );
      // Without prompt=consent a reconnect returns no refresh token.
      expect(params.get('access_type')).toBe('offline');
      expect(params.get('prompt')).toBe('consent');
      expect(params.get('state')).toBeTruthy();
    });

    it('does not request the broader calendar.readonly scope', () => {
      const scope = new URL(service.buildAuthUrl(7)).searchParams.get('scope');
      expect(scope).not.toContain('auth/calendar.readonly');
    });

    it('rejects with 503 rather than a half-built URL when unconfigured', () => {
      const unconfigured = build({ GOOGLE_OAUTH_CLIENT_ID: undefined as never });
      expect(() => unconfigured.buildAuthUrl(7)).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('state', () => {
    it('round-trips to the minting account id', () => {
      expect(service.verifyState(service.mintState(42))).toBe(42);
    });

    it('rejects a state past its 10-minute TTL', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const state = service.mintState(42);

      jest.setSystemTime(new Date(Date.now() + STATE_TTL_MS + 1000));
      expect(service.verifyState(state)).toBeNull();
    });

    it('rejects a tampered signature', () => {
      const state = service.mintState(42);
      const [payload, signature] = state.split('.');
      const flipped =
        signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');

      expect(service.verifyState(`${payload}.${flipped}`)).toBeNull();
    });

    it('rejects a tampered payload, so the account id cannot be swapped', () => {
      const state = service.mintState(42);
      const forged = Buffer.from(
        JSON.stringify({ a: 999, e: Date.now() + STATE_TTL_MS }),
        'utf8',
      ).toString('base64url');

      expect(service.verifyState(`${forged}.${state.split('.')[1]}`)).toBeNull();
    });

    it('rejects a state signed with a different secret', () => {
      const other = build({ PROTECTED_DATA_SECRET: 'a-different-secret-value' });
      expect(service.verifyState(other.mintState(42))).toBeNull();
    });

    it('rejects a missing or malformed state', () => {
      expect(service.verifyState(undefined)).toBeNull();
      expect(service.verifyState('')).toBeNull();
      expect(service.verifyState('garbage')).toBeNull();
      expect(service.verifyState('.sig')).toBeNull();
    });
  });

  describe('handleCallback', () => {
    const tokens = {
      access_token: 'at-1',
      refresh_token: 'rt-1',
      expires_in: 3599,
      scope: GOOGLE_CALENDAR_SCOPE,
    };

    it('posts a form-encoded exchange and stores the credential', async () => {
      httpPost.mockReturnValue(of(tokens));

      const result = await service.handleCallback({
        code: 'auth-code',
        state: service.mintState(42),
        scope: GOOGLE_CALENDAR_SCOPE,
      });

      expect(result.status).toBe('ok');
      expect(result.redirectUrl).toBe(
        'wardrobeassistantfront://calendar-connected?status=ok',
      );

      const [url, body, options] = httpPost.mock.calls[0];
      expect(url).toBe(GOOGLE_TOKEN_URL);
      expect(body).toBeInstanceOf(URLSearchParams);
      expect(Object.fromEntries(body as URLSearchParams)).toEqual({
        client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: CONFIG.GOOGLE_OAUTH_CLIENT_SECRET,
        code: 'auth-code',
        grant_type: 'authorization_code',
        redirect_uri: CONFIG.GOOGLE_OAUTH_REDIRECT_URI,
      });
      expect(options).toEqual({ timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS });
      expect(GOOGLE_TOKEN_TIMEOUT_MS).toBe(10000);

      expect(storeCredential).toHaveBeenCalledWith({
        accountId: 42,
        refreshToken: 'rt-1',
        accessToken: 'at-1',
        expiresInSeconds: 3599,
        scope: GOOGLE_CALENDAR_SCOPE,
      });
    });

    it('maps ?error=access_denied to status=denied and stores nothing', async () => {
      const result = await service.handleCallback({
        error: 'access_denied',
        state: service.mintState(42),
      });

      expect(result.status).toBe('denied');
      expect(result.redirectUrl).toBe(
        'wardrobeassistantfront://calendar-connected?status=denied',
      );
      expect(httpPost).not.toHaveBeenCalled();
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('maps any other Google error to status=error', async () => {
      const result = await service.handleCallback({ error: 'server_error' });

      expect(result.status).toBe('error');
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('stores nothing when the granted scope omits calendar.events.readonly', async () => {
      const result = await service.handleCallback({
        code: 'auth-code',
        state: service.mintState(42),
        scope: 'https://www.googleapis.com/auth/userinfo.email',
      });

      expect(result.status).toBe('scope_denied');
      expect(httpPost).not.toHaveBeenCalled();
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('stores nothing and hands the grant back when the exchange itself is under-scoped', async () => {
      httpPost.mockReturnValue(
        of({ ...tokens, scope: 'https://www.googleapis.com/auth/drive' }),
      );

      const result = await service.handleCallback({
        code: 'auth-code',
        state: service.mintState(42),
      });

      expect(result.status).toBe('scope_denied');
      expect(storeCredential).not.toHaveBeenCalled();
      expect(revokeToken).toHaveBeenCalledWith('at-1', 42);
    });

    it('rejects an unverifiable state before any token exchange', async () => {
      const result = await service.handleCallback({
        code: 'auth-code',
        state: 'garbage',
      });

      expect(result.status).toBe('error');
      expect(httpPost).not.toHaveBeenCalled();
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('returns status=error when the exchange fails', async () => {
      httpPost.mockReturnValue(
        throwError(() => ({ status: 400, body: { error: 'invalid_grant' } })),
      );

      const result = await service.handleCallback({
        code: 'auth-code',
        state: service.mintState(42),
      });

      expect(result.status).toBe('error');
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('returns status=error when Google returns no refresh token', async () => {
      httpPost.mockReturnValue(of({ ...tokens, refresh_token: undefined }));

      const result = await service.handleCallback({
        code: 'auth-code',
        state: service.mintState(42),
      });

      expect(result.status).toBe('error');
      expect(storeCredential).not.toHaveBeenCalled();
    });

    it('still redirects into the app when GOOGLE_OAUTH_APP_REDIRECT is unset', async () => {
      const unconfigured = build({
        GOOGLE_OAUTH_APP_REDIRECT: undefined as never,
      });

      const result = await unconfigured.handleCallback({ state: 'garbage' });

      expect(result.redirectUrl).toBe(
        'wardrobeassistantfront://calendar-connected?status=error',
      );
    });

    it('appends status with & when the configured redirect already has a query', async () => {
      const withQuery = build({
        GOOGLE_OAUTH_APP_REDIRECT: 'wardrobeassistantfront://cal?src=oauth',
      });

      const result = await withQuery.handleCallback({ error: 'access_denied' });

      expect(result.redirectUrl).toBe(
        'wardrobeassistantfront://cal?src=oauth&status=denied',
      );
    });
  });
});
