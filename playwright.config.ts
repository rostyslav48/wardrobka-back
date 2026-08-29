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
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
});
