// fixtures/nuxt/app/plugins/vuetify.ts
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'

export default defineNuxtPlugin((app) => {
  app.vueApp.use(createVuetify({ components, theme: { defaultTheme: 'light' } }))
})
