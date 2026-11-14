// fixtures/vite-vue/vite.config.ts
import vue from '@vitejs/plugin-vue'
import smegglect from 'smegglect/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    // Release builds leave Smegglect out; SMEGGLECT_DEBUG=1 is the explicit, build-time debug switch.
    smegglect({ project: { id: 'vite-vue' }, debug: process.env.SMEGGLECT_DEBUG === '1', bridge: true }),
  ],
  server: { port: 5201, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5202, strictPort: true, host: '127.0.0.1' },
})
