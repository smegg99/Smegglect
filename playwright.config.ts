// playwright.config.ts
// Chromium and Firefox. WebKit is covered natively, through the Wails fixture on WebKitGTK (just wails-test).
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1280, height: 800 },
    // Positions and sizes are read right after a drop or an opening; tests/e2e/motion.spec.ts turns motion on.
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node_modules/.bin/vite --config playground/vite.config.ts',
    url: 'http://127.0.0.1:5199/plain.html',
    // A local run reuses a dev server already up; CI always starts its own.
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
  ],
})
