// tests/bridge/vitest.config.ts
// Brokers started in-process run from source; they carry the package version, as the built ones do,
// so they match the dist CLI the tests spawn.
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  define: { __SMEGGLECT_VERSION__: JSON.stringify(version) },
  test: { environment: 'node', include: ['tests/bridge/**/*.test.ts'], root: '../..', testTimeout: 20_000, hookTimeout: 20_000 },
})
