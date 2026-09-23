import { defineConfig } from '@playwright/test';

/**
 * API e2e configuration for the wardrobe backend.
 *
 * Expects the full stack (postgres, rabbitmq and the 5 Nest apps) to already be
 * running — see test/e2e/README.md.
 */
export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './test/e2e/support/global-setup.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: process.env.API_BASE_URL ?? 'http://localhost:3000',
    // No `extraHTTPHeaders: { 'Content-Type': 'application/json' }` here
    // (QA-43): it applied to every request regardless of body shape, so it
    // overrode the multipart boundary header on file-upload requests and the
    // gateway received a multipart body labelled application/json. Playwright
    // already sets Content-Type: application/json on its own whenever `data`
    // is a plain object (every existing test in this suite), so dropping this
    // is a no-op for JSON requests and only fixes multipart ones.
  },
});
