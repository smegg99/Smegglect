// vite.config.ts
// Browser library build. Vue is bundled into the overlay entry; the host needs no Vue.
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  define: {
    // Without a host bundler these would be undefined at runtime.
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__VUE_OPTIONS_API__': 'false',
    '__VUE_PROD_DEVTOOLS__': 'false',
    '__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: true,
    lib: {
      entry: {
        index: 'src/overlay/index.ts',
        core: 'src/core/index.ts',
        dom: 'src/dom/index.ts',
        vue: 'src/vue/index.ts',
        wails: 'src/wails/index.ts',
      },
      formats: ['es'],
    },
    rolldownOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
})
