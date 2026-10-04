/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Unless something is already listening on port 3000, start the app on its own
  // freshly seeded database, so the flows never touch development data.
  webServer: {
    command: 'npm run db:seed && npm run dev',
    env: { DATABASE_URL: 'file:data/e2e.db' },
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
