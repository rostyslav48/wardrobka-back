import { test, expect } from '@playwright/test';
import { takeUser, auth, login, TestUser } from './support/api';

let user: TestUser;

test.beforeAll(() => {
  user = takeUser();
});

test.describe('POST /auth/signup', () => {
  test('rejects a duplicate email', async ({ request }) => {
    const res = await request.post('/auth/signup', {
      data: { name: 'Dup', email: user.email, password: 'Password123!' },
    });
    expect([409, 400, 429]).toContain(res.status());
    expect(res.status(), 'duplicate signup must not succeed').not.toBe(201);
  });

  test('rejects a malformed email', async ({ request }) => {
    const res = await request.post('/auth/signup', {
      data: { name: 'Bad', email: 'not-an-email', password: 'Password123!' },
    });
    expect([400, 429]).toContain(res.status());
  });

  test('rejects a short password', async ({ request }) => {
    const res = await request.post('/auth/signup', {
      data: { name: 'Bad', email: `short${Date.now()}@example.com`, password: 'abc' },
    });
    expect([400, 429]).toContain(res.status());
  });

  test('never returns the password hash', async () => {
    // asserted against the body captured at creation time
    expect(JSON.stringify(user)).not.toContain('$2');
  });
});

test.describe('POST /auth/login', () => {
  test('logs in with valid credentials', async ({ request }) => {
    const res = await login(request, { email: user.email, password: user.password });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.email).toBe(user.email);
    expect(body).not.toHaveProperty('password');
  });

  test('rejects a wrong password with 401', async ({ request }) => {
    const res = await login(request, {
      email: user.email,
      password: 'WrongPassword123!',
    });
    expect(res.status()).toBe(401);
  });

  test('rejects an unknown email without a 5xx', async ({ request }) => {
    // The status code itself is BUG-001 (404 leaks account existence) — that is
    // pinned in known-bugs.e2e.ts.
    const res = await login(request, {
      email: `nobody${Date.now()}@example.com`,
      password: 'Password123!',
    });
    expect(res.status()).toBeLessThan(500);
    expect(res.ok()).toBe(false);
  });
});

test.describe('auth guard', () => {
  test('GET /auth/profile without a token is 401', async ({ request }) => {
    const res = await request.get('/auth/profile');
    expect(res.status()).toBe(401);
  });

  test('GET /auth/profile with a garbage token is 401', async ({ request }) => {
    const res = await request.get('/auth/profile', {
      headers: { Authorization: 'Bearer not.a.jwt' },
    });
    expect(res.status()).toBe(401);
  });

  test('a token signed with the wrong secret is rejected', async ({ request }) => {
    // header/payload of a valid-looking token with a forged signature
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6IngiLCJlbWFpbCI6InhAeC5jb20iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjUzNDAyMzAwNzk5fQ.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const res = await request.get('/auth/profile', {
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(res.status()).toBe(401);
  });

  test('an alg=none token is rejected', async ({ request }) => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      id: 1,
      name: 'x',
      email: 'x@x.com',
      exp: 2534023007,
    })}.`;
    const res = await request.get('/auth/profile', {
      headers: { Authorization: `Bearer ${none}` },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('profile', () => {
  test('GET /auth/profile returns the caller', async ({ request }) => {
    const res = await request.get('/auth/profile', { headers: auth(user) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(body.email).toBe(user.email);
  });

  test('GET /auth/profile does not leak internal fields', async ({ request }) => {
    const body = await (
      await request.get('/auth/profile', { headers: auth(user) })
    ).json();
    expect(body, 'password must never be serialised').not.toHaveProperty('password');
    expect(
      body,
      'protectedData is an encrypted internal column and must not reach the client',
    ).not.toHaveProperty('protectedData');
  });

  test('PATCH /auth/profile updates name and city', async ({ request }) => {
    const res = await request.patch('/auth/profile', {
      headers: auth(user),
      data: { name: 'Renamed User', city: 'Kyiv' },
    });
    expect(res.status()).toBe(200);
    const after = await (
      await request.get('/auth/profile', { headers: auth(user) })
    ).json();
    expect(after.name).toBe('Renamed User');
    expect(after.city).toBe('Kyiv');
  });

  test('PATCH /auth/profile can clear the city with null', async ({ request }) => {
    const res = await request.patch('/auth/profile', {
      headers: auth(user),
      data: { city: null },
    });
    expect(res.status()).toBe(200);
    const after = await (
      await request.get('/auth/profile', { headers: auth(user) })
    ).json();
    expect(after.city).toBeNull();
  });

  test('PATCH /auth/profile rejects unknown properties', async ({ request }) => {
    const res = await request.patch('/auth/profile', {
      headers: auth(user),
      data: { name: 'Ok Name', role: 'admin' },
    });
    expect(res.status()).toBe(400);
  });

  test('PATCH /auth/profile rejects a too-short name', async ({ request }) => {
    const res = await request.patch('/auth/profile', {
      headers: auth(user),
      data: { name: 'x' },
    });
    expect(res.status()).toBe(400);
  });

  test('PATCH /auth/profile requires authentication', async ({ request }) => {
    const res = await request.patch('/auth/profile', { data: { name: 'Nope' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('push token', () => {
  test('PATCH /auth/push-token stores and clears a token', async ({ request }) => {
    const set = await request.patch('/auth/push-token', {
      headers: auth(user),
      data: { expoPushToken: 'ExponentPushToken[e2e-test-token]' },
    });
    expect(set.status()).toBe(200);

    const clear = await request.patch('/auth/push-token', {
      headers: auth(user),
      data: { expoPushToken: null },
    });
    expect(clear.status()).toBe(200);
  });

  test('PATCH /auth/push-token requires authentication', async ({ request }) => {
    const res = await request.patch('/auth/push-token', {
      data: { expoPushToken: 'x' },
    });
    expect(res.status()).toBe(401);
  });
});
