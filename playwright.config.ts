// playwright.config.ts
// Chromium and Firefox. Playwright's WebKit build needs Ubuntu libraries this machine lacks; WebKitGTK is tested natively.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node_modules/.bin/vite --config playground/vite.config.ts',
    url: 'http://127.0.0.1:5199/plain.html',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
  ],
})
