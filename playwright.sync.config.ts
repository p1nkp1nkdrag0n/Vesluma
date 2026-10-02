import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build the frontend and local server first. Each test starts a disposable
// loopback service with an explicit temporary database; never .local-data.
export default defineConfig({
  testDir: './tests/sync-e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 75_000,
  expect: { timeout: 12_000 },
  outputDir: join(process.env.VESLUMA_SYNC_QA_DIR ?? join(tmpdir(), 'vesluma-local-sync-qa'), 'test-results'),
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    launchOptions: process.env.VESLUMA_QA_BROWSER ? { executablePath: process.env.VESLUMA_QA_BROWSER } : {},
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
