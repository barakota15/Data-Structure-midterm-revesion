import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173'
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 5173',
    port: 5173,
    reuseExistingServer: true
  }
});
