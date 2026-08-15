import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI === 'true' ? 2 : 0,
  reporter: process.env.CI === 'true' ? [['html', { open: 'never' }], ['github']] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] }, testMatch: /smoke\.spec\.ts/u },
  ],
  webServer: [
    {
      command: 'NODE_ENV=test PORT=3001 CLIENT_ORIGINS=http://127.0.0.1:5173 SESSION_SECRET=testing-session-secret-32-characters ROOM_TOKEN_PEPPER=testing-room-pepper-32-characters npm run dev:server',
      url: 'http://127.0.0.1:3001/health', reuseExistingServer: !process.env.CI, timeout: 60_000,
    },
    { command: 'npm run dev -w @friendly-card-room/web -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
