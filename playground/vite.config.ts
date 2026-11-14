// playground/vite.config.ts
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const src = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  resolve: {
    alias: [
      { find: /^smegglect$/, replacement: src('src/overlay/index.ts') },
      { find: /^smegglect\/core$/, replacement: src('src/core/index.ts') },
      { find: /^smegglect\/dom$/, replacement: src('src/dom/index.ts') },
      { find: /^smegglect\/vue$/, replacement: src('src/vue/index.ts') },
      { find: /^smegglect-dist$/, replacement: src('dist/index.js') },
    ],
  },
  server: { port: 5199, strictPort: true, host: '127.0.0.1', fs: { allow: [src('')] } },
})
