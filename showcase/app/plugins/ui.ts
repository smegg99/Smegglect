// showcase/app/plugins/ui.ts
// Vuetify with S99AB's theme and component defaults, and S99AB's own messages for its components.
import { s99abTheme } from '@smegg99/s99ab/theme'
import { withS99ab } from '@smegg99/s99ab/i18n'
import { createI18n } from 'vue-i18n'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

export default defineNuxtPlugin((app) => {
  app.vueApp.use(createVuetify({
    ...s99abTheme(),
    components,
    directives,
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  }))
  app.vueApp.use(createI18n({ legacy: false, locale: 'en', messages: withS99ab({ en: {}, pl: {} }) }))
})
