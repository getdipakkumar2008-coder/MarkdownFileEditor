import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;

/**
 * doc/Architecture.md §8: Chromium project exercises the real
 * NativeFileSystemAdapter against an in-page mock of the File System Access
 * API (Playwright can't script the OS-native picker). Firefox project
 * exercises FallbackFileSystemAdapter's real <input webkitdirectory> path,
 * since Firefox genuinely lacks showDirectoryPicker — no mocking needed
 * there, the app's own capability detection does the right thing.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /fallback-mode\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /fallback-mode\.spec\.ts/,
    },
  ],
});
