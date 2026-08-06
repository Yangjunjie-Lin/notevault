import { defineConfig, devices } from '@playwright/test'

import {
  artifactOutputDirectory,
  frontendOrigin,
  reportOutputDirectory,
} from './tests/e2e/ports'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: artifactOutputDirectory,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: reportOutputDirectory }]]
    : 'list',
  use: {
    baseURL: frontendOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grep: /@smoke/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'] } },
  ],
})
