import { request as pwRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const POOL_SIZE = Number(process.env.E2E_USER_POOL ?? 14);
export const USERS_FILE = path.join(__dirname, '..', '..', '..', '.e2e-cache', 'e2e-users.json');

/**
 * `POST /auth/signup` is throttled to 5 requests / 60s per IP, so the suites
 * cannot create accounts on demand. Provision a pool once, up front, and share
 * it through a file.
 */
async function globalSetup() {
  const ctx = await pwRequest.newContext({ baseURL: BASE_URL });

  // Reuse a previously provisioned pool when its tokens are still valid — the
  // signup throttler makes re-provisioning cost a minute per 5 accounts.
  if (!process.env.E2E_FRESH_USERS && fs.existsSync(USERS_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(cached) && cached.length >= POOL_SIZE) {
        const probe = await ctx.get('/auth/profile', {
          headers: { Authorization: `Bearer ${cached[cached.length - 1].token}` },
        });
        if (probe.ok()) {
          await ctx.dispose();
          return;
        }
      }
    } catch {
      // fall through and re-provision
    }
  }

  const users: any[] = [];
  const password = 'Password123!';

  while (users.length < POOL_SIZE) {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const res = await ctx.post('/auth/signup', {
      data: { name: `E2E User ${users.length + 1}`, email, password },
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok()) {
      const body = await res.json();
      users.push({ id: body.id, name: body.name, email, password, token: body.accessToken });
      continue;
    }

    if (res.status() === 429) {
      // eslint-disable-next-line no-console
      console.log(`[global-setup] signup throttled at ${users.length}/${POOL_SIZE}, waiting 61s…`);
      await new Promise((r) => setTimeout(r, 61_000));
      continue;
    }

    throw new Error(`[global-setup] signup failed (${res.status()}): ${await res.text()}`);
  }

  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  await ctx.dispose();
}

export default globalSetup;
