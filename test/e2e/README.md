# Backend API e2e (Playwright)

Drives the **live** stack — gateway + four microservices + RabbitMQ + Postgres.
Nothing is mocked.

```bash
npm run test:e2e:api          # all suites
npx playwright test test/e2e/wardrobe.e2e.ts
npx playwright test -g "IDOR"
```

Bring the stack up first — the exact commands, the account-pool mechanism and the
full coverage map are in `planning/qa/E2E-TEST-COVERAGE.md`. Findings are in
`planning/qa/BUGS-2026-08-29.md`.

## Layout

| file | purpose |
|---|---|
| `support/global-setup.ts` | provisions the shared account pool (signup is rate limited to 5/60s) and caches it in `.e2e-cache/` |
| `support/api.ts` | `takeUser()`, `auth()`, `login()` (429-aware), `throttleGap()` |
| `auth.e2e.ts` | signup / login / JWT guard / profile / push token |
| `wardrobe.e2e.ts` | item CRUD, filters, validation, cross-user access |
| `outfit-log.e2e.ts` | log CRUD, date rules, cross-user access |
| `ai-assistant.e2e.ts` | auth + validation + read paths (live model calls are opt-in) |
| `known-bugs.e2e.ts` | one `test.fail()` reproduction per open defect |

## Rules

- **Never call `POST /auth/signup` from a test.** Use `takeUser()`; the throttler
  will fail the suite otherwise.
- **Never call `POST /auth/login` directly.** Use `login()` from `support/api.ts`,
  which retries past the 10/60s limit.
- Space out writes with `throttleGap()` — throttled routes currently allow
  3 requests/second (that mismatch is BUG-003).
- A test that documents a defect belongs in `known-bugs.e2e.ts` with
  `test.fail()`, so the functional suites stay green and a fix announces itself.

## Environment

| variable | default | meaning |
|---|---|---|
| `API_BASE_URL` | `http://localhost:3000` | gateway URL |
| `E2E_USER_POOL` | `14` | accounts to provision |
| `E2E_FRESH_USERS` | unset | force re-provisioning instead of using the cache |
| `E2E_RUN_AI_CALLS` | unset | run the live Gemini smoke test (spends real quota) |
