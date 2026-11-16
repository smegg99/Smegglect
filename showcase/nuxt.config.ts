// showcase/nuxt.config.ts
// Tabby, a bill splitter on the S99AB layer, with Smegglect in `nuxt dev`. A production build carries none of it.
export default defineNuxtConfig({
  extends: ['@smegg99/s99ab'],
  modules: ['smegglect/nuxt'],
  smegglect: {
    project: { id: 'showcase', name: 'Tabby' },
    // Started with `nuxt dev`: Send to Claude reaches a Claude Code session running /smegglect in this folder.
    bridge: true,
  },
  css: ['vuetify/styles', '@mdi/font/css/materialdesignicons.css'],
  ssr: false,
  devServer: { host: '127.0.0.1', port: 5280 },
  devtools: { enabled: false },
  telemetry: false,
  compatibilityDate: '2026-11-10',
})
