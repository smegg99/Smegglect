// playwright.fixtures.config.ts
// Consumer fixtures installed from the packed tarball: Vite + Vue, Nuxt + Vuetify, a plain page.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/fixtures',
  outputDir: 'test-results/fixtures',
  reporter: [['list']],
  timeout: 60_000,
  use: { viewport: { width: 1280, height: 800 } },
  webServer: [
    { command: 'node_modules/.bin/vite', cwd: 'fixtures/vite-vue', url: 'http://127.0.0.1:5201/', reuseExistingServer: true },
    { command: 'node_modules/.bin/nuxt dev', cwd: 'fixtures/nuxt', url: 'http://127.0.0.1:5203/', reuseExistingServer: true, timeout: 120_000 },
    { command: 'python3 -m http.server 5204 --bind 127.0.0.1', cwd: 'fixtures/plain', url: 'http://127.0.0.1:5204/', reuseExistingServer: true },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
  ],
})
