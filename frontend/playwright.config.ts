import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'python -m uvicorn tests.e2e_app:app --app-dir backend --host 127.0.0.1 --port 8000',
      cwd: '..',
      env: {
        ENVIRONMENT: 'test',
        ALLOWED_ORIGINS: 'http://127.0.0.1:4173',
      },
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --mode e2e --port 4173',
      cwd: '.',
      env: {
        VITE_TEST_AUTH: 'true',
        VITE_API_BASE_URL: 'http://127.0.0.1:8000',
      },
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
