// fixtures/nuxt/nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: true,
  modules: ['smegglect/nuxt'],
  smegglect: {
    project: { id: 'nuxt-fixture' },
    // Explicit build-time switch; a normal build contains no Smegglect.
    debug: process.env.SMEGGLECT_DEBUG === '1',
  },
  css: ['vuetify/styles'],
  build: { transpile: ['vuetify'] },
  devServer: { host: '127.0.0.1', port: 5203 },
  telemetry: false,
})
