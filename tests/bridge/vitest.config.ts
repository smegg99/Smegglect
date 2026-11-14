// tests/bridge/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/bridge/**/*.test.ts'], root: '../..', testTimeout: 20_000, hookTimeout: 20_000 },
})
