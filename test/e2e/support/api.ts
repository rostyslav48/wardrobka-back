import { APIRequestContext, request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export interface TestUser {
  id: number;
  name: string;
  email: string;
  password: string;
  token: string;
}

const USERS_FILE = path.join(__dirname, '..', '..', '..', '.e2e-cache', 'e2e-users.json');

let pool: TestUser[] | null = null;
let cursor = 0;

/**
 * Hands out one account from the pool provisioned by global-setup. Signup is
 * throttled to 5 requests / 60s per IP, so suites must not create accounts
 * themselves.
 */
export function takeUser(): TestUser {
  if (!pool) {
    pool = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  }
  if (cursor >= pool!.length) {
    throw new Error('e2e user pool exhausted — raise E2E_USER_POOL');
  }
  return pool![cursor++];
}

/**
 * POST /auth/signup is throttled to 5 requests / 60s per IP, so account
 * creation retries with a back-off instead of failing the suite.
 */
export async function createUser(
  ctx: APIRequestContext,
  namePrefix = 'E2E User',
): Promise<TestUser> {
  const password = 'Password123!';

  for (let attempt = 0; attempt < 12; attempt++) {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const res = await ctx.post(`${BASE_URL}/auth/signup`, {
      data: { name: `${namePrefix}`, email, password },
    });

    if (res.ok()) {
      const body = await res.json();
      return { id: body.id, name: body.name, email, password, token: body.accessToken };
    }

    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 13_000));
      continue;
    }

    throw new Error(`signup failed (${res.status()}): ${await res.text()}`);
  }

  throw new Error('signup kept returning 429 — throttler window never opened');
}

export function auth(user: TestUser) {
  return { Authorization: `Bearer ${user.token}` };
}

/**
 * Throttled routes actually run on { ttl: 1000, limit: 3 } (see BUG-003), so a
 * short gap is enough to open a fresh window.
 */
export async function throttleGap(ms = 1_300) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function newContext(): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
}

/**
 * `POST /auth/login` is throttled to 10 requests / 60s per IP; the suites make
 * more login calls than that, so retry once the window rolls over.
 */
export async function login(
  ctx: APIRequestContext,
  data: { email: string; password: string },
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await ctx.post('/auth/login', { data });
    if (res.status() !== 429) return res;
    await new Promise((r) => setTimeout(r, 8_000));
  }
  throw new Error('login stayed rate limited');
}

/**
 * Throttled writes retry past a 429 so suites stay deterministic when they run
 * back to back. Only for tests that are not themselves about rate limiting.
 */
export async function postJson(
  ctx: APIRequestContext,
  url: string,
  user: TestUser,
  data: unknown,
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await ctx.post(url, { headers: auth(user), data: data as any });
    if (res.status() !== 429) return res;
    await throttleGap();
  }
  throw new Error(`${url} stayed rate limited`);
}
