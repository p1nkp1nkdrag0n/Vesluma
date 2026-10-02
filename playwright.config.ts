import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Run npm run build first. This suite starts or reuses the production preview;
// VESLUMA_QA_URL targets an already running build at an alternate URL.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: join(process.env.VESLUMA_QA_DIR ?? join(tmpdir(), 'vesluma-pink-qa'), 'test-results'),
  reporter: [['list']],
  webServer: process.env.VESLUMA_QA_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  use: {
    baseURL: process.env.VESLUMA_QA_URL ?? 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: process.env.VESLUMA_QA_BROWSER ? { executablePath: process.env.VESLUMA_QA_BROWSER } : {},
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
