// fixtures/wails/frontend/vite.config.ts
import vue from '@vitejs/plugin-vue'
import smegglect from 'smegglect/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    smegglect({
      project: { id: 'wails-desk', name: 'Smegglect Desk' },
      // Packaged debug builds set SMEGGLECT_DEBUG=1 when building; release builds leave it out.
      debug: process.env.SMEGGLECT_DEBUG === '1',
      client: '/src/smegglect.ts',
    }),
  ],
  server: { port: 5205, strictPort: true, host: '127.0.0.1' },
})
