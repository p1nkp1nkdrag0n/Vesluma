import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Build frontend + server first. The shared server fixture always receives an
// explicit temporary SQLite path. This suite never opens .local-data.
const evidenceDir = process.env.VESLUMA_CITIES_QA_DIR ?? join(tmpdir(), 'vesluma-gba-qa');
process.env.VESLUMA_SYNC_QA_DIR = evidenceDir;

export default defineConfig({
  testDir: './tests/cities-e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: join(evidenceDir, 'test-results'),
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
