import { test, expect } from '@playwright/test';
import { takeUser, auth, TestUser } from './support/api';

/**
 * The connect / disconnect round trip needs a real Google account granting
 * consent in a browser, which this suite cannot automate. `E2E_RUN_GOOGLE_CALLS=1`
 * opts into the one test that makes a real call to Google; everything else here
 * exercises the parts that never leave our own gateway.
 */
let user: TestUser;

test.beforeAll(() => {
  user = takeUser();
});

test.describe('auth', () => {
  const routes: [string, 'get' | 'post' | 'put' | 'delete'][] = [
    ['/calendar/status', 'get'],
    ['/calendar/google/auth-url', 'get'],
    ['/calendar/occasions', 'get'],
    ['/calendar/google', 'delete'],
  ];

  for (const [path, method] of routes) {
    test(`${method.toUpperCase()} ${path} requires a token`, async ({
      request,
    }) => {
      const res = await (request as any)[method](path, { data: {} });
      expect(res.status()).toBe(401);
    });
  }

  // /calendar/google/callback is Google's redirect target: it is reached by
  // an unauthenticated browser mid-OAuth-dance, carrying a signed `state`
  // instead of a bearer token, so it is @Public() by design and deliberately
  // absent from the table above.
  test('GET /calendar/google/callback does not require a token', async ({
    request,
  }) => {
    const res = await request.get('/calendar/google/callback', {
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(401);
  });
});

test.describe('GET /calendar/status', () => {
  test('a fresh user is disconnected', async ({ request }) => {
    const res = await request.get('/calendar/status', { headers: auth(user) });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toEqual({ status: 'disconnected' });
  });
});

test.describe('GET /calendar/occasions', () => {
  test('returns an empty array while disconnected', async ({ request }) => {
    const res = await request.get('/calendar/occasions', {
      headers: auth(user),
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('disconnected');
    expect(body.occasions).toEqual([]);
  });

  test('rejects days above the 7-day maximum', async ({ request }) => {
    const res = await request.get('/calendar/occasions?days=99', {
      headers: auth(user),
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an unknown query parameter', async ({ request }) => {
    const res = await request.get('/calendar/occasions?nope=1', {
      headers: auth(user),
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('GET /calendar/google/callback', () => {
  test('an invalid state redirects into the app with status=error', async ({
    request,
  }) => {
    const res = await request.get(
      '/calendar/google/callback?state=garbage&code=x',
      {
        maxRedirects: 0,
      },
    );
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toBeDefined();
    expect(location.startsWith('wardrobeassistantfront://')).toBe(true);
    expect(location).toContain('status=error');
  });
});

test.describe('DELETE /calendar/google', () => {
  test('disconnecting a never-connected account is idempotent', async ({
    request,
  }) => {
    const first = await request.delete('/calendar/google', {
      headers: auth(user),
    });
    expect(first.status(), await first.text()).toBeLessThan(300);

    const second = await request.delete('/calendar/google', {
      headers: auth(user),
    });
    expect(second.status(), await second.text()).toBeLessThan(300);

    const status = await request.get('/calendar/status', {
      headers: auth(user),
    });
    expect(await status.json()).toEqual({ status: 'disconnected' });
  });
});

test.describe('live Google', () => {
  test.skip(
    !process.env.E2E_RUN_GOOGLE_CALLS,
    'set E2E_RUN_GOOGLE_CALLS=1 to make a live call to Google',
  );

  test('the generated auth URL is accepted by Google, not rejected as a misconfigured client', async ({
    request,
  }) => {
    test.setTimeout(30_000);

    const authUrlRes = await request.get('/calendar/google/auth-url', {
      headers: auth(user),
    });
    expect(authUrlRes.status(), await authUrlRes.text()).toBe(200);
    const { url } = await authUrlRes.json();
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');

    // A bare, cookie-less GET cannot complete the consent screen — that needs
    // a human in a real Google account. It can still prove Google accepts our
    // client_id/redirect_uri pair: a misconfigured client comes back as
    // Google's own error page ("Error 400: invalid_request" or
    // "redirect_uri_mismatch"), not ours.
    let googleRes;
    try {
      googleRes = await request.get(url, { maxRedirects: 5 });
    } catch {
      test.skip(true, 'no route to accounts.google.com from this environment');
      return;
    }
    const body = await googleRes.text();
    test.skip(
      /blocked by (network|local) (policy|rule)/i.test(body),
      "accounts.google.com is not reachable through this environment's network policy",
    );

    expect(googleRes.status(), body.slice(0, 500)).toBeLessThan(400);
    expect(body).not.toContain('Error 400');
  });
});
