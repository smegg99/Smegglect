// fixtures/nuxt/nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: true,
  modules: ['smegglect/nuxt'],
  smegglect: {
    project: { id: 'nuxt-fixture' },
    // Explicit build-time switch; a normal build contains no Smegglect.
    debug: process.env.SMEGGLECT_DEBUG === '1',
    // Started when `nuxt dev` listens, on whatever port it got: the tests run it on 5213, not the 5203 below.
    bridge: true,
  },
  css: ['vuetify/styles'],
  build: { transpile: ['vuetify'] },
  devServer: { host: '127.0.0.1', port: 5203 },
  telemetry: false,
})
