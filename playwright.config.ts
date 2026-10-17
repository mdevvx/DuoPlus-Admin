import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: process.env.HUB_URL ?? 'http://localhost:3000' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/login', reuseExistingServer: true },
});
