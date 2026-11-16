// playground/vite.config.ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { overlayAliases, overlayOptimizeDeps, overlayPlugins, overlayResolve } from '../vite.overlay'

const src = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: overlayPlugins(),
  optimizeDeps: overlayOptimizeDeps,
  resolve: {
    ...overlayResolve,
    alias: [
      ...overlayAliases,
      { find: /^smegglect$/, replacement: src('src/overlay/index.ts') },
      { find: /^smegglect\/core$/, replacement: src('src/core/index.ts') },
      { find: /^smegglect\/dom$/, replacement: src('src/dom/index.ts') },
      { find: /^smegglect\/vue$/, replacement: src('src/vue/index.ts') },
      { find: /^smegglect-dist$/, replacement: src('dist/index.js') },
    ],
  },
  server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [src('')] } },
})
