// src/overlay/vuetify/index.ts
// The overlay's Vuetify: S99AB's theme and component defaults, the theme stylesheet written into the shadow
// root, and menus, tooltips and dialogs opened inside it instead of the host page's body.

import { rebuildThemes, s99abTheme } from '@smegg99/s99ab/theme'
import type { App } from 'vue'
import { createVuetify, type VuetifyOptions } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { forShadow } from './shadow-css'
import { LAYER_ORDER } from './styles'

/** Components that open in a layer of their own; each opens inside the shadow root. */
const LAYERED = ['VMenu', 'VTooltip', 'VDialog', 'VOverlay', 'VSnackbar'] as const

export interface OverlayVuetify {
  /** Light or dark, as the overlay's theme setting resolves for the page. */
  setDark: (dark: boolean) => void
  /** A hex colour, or '' for the theme's own. */
  setAccent: (accent: string) => void
  /** Writes the theme stylesheet into another shadow root too, such as the pop-out's; returns how to stop. */
  mirrorTheme: (style: HTMLStyleElement) => () => void
  /** Stops what Vuetify started outside the app, such as its window resize listener. */
  dispose: () => void
}

export interface VuetifyInput {
  /** Inside the shadow root: where menus, tooltips and dialogs open. */
  layer: Element
  /** In the shadow root: where Vuetify's theme stylesheet is written. */
  themeStyle: HTMLStyleElement
  dark: boolean
  accent: string
}

/** What Vuetify asks of a head manager: the stylesheet, and later its updates. */
type GetHead = () => { style: { textContent: string }[] }

/** The theme stylesheet's targets, and the text last written to them. */
interface ThemeSheets {
  targets: Set<HTMLStyleElement>
  text: string
}

/**
 * Vuetify hands its theme stylesheet to `usehead` when the app provides one; this one writes it into the
 * shadow roots, so nothing of the overlay reaches the host's document.head.
 */
function shadowHead(sheets: ThemeSheets) {
  const write = (getHead: GetHead) => {
    sheets.text = LAYER_ORDER + forShadow(getHead().style.map(entry => entry.textContent).join('\n'))
    for (const style of sheets.targets) style.textContent = sheets.text
  }
  return {
    push(getHead: GetHead) {
      write(getHead)
      return { patch: write }
    },
  }
}

type Defaults = NonNullable<VuetifyOptions['defaults']>

/** S99AB's defaults, with every layered component attached to the overlay's own layer. */
function defaultsFor(base: Defaults, layer: Element): Defaults {
  const attached: Defaults = { ...base }
  for (const name of LAYERED) attached[name] = { ...base?.[name], attach: layer }
  return attached
}

export function installVuetify(app: App, input: VuetifyInput): OverlayVuetify {
  // Before `use`: Vuetify looks for a head manager when it is installed.
  const sheets: ThemeSheets = { targets: new Set([input.themeStyle]), text: '' }
  app.provide('usehead', shadowHead(sheets))
  const theme = s99abTheme({ accent: input.accent || undefined, defaultTheme: input.dark ? 'dark' : 'light' })
  const vuetify = createVuetify({
    ...theme,
    defaults: defaultsFor(theme.defaults ?? {}, input.layer),
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  })
  app.use(vuetify)
  return {
    setDark: dark => vuetify.theme.change(dark ? 'dark' : 'light'),
    setAccent: accent => rebuildThemes(vuetify.theme.themes.value, { accent: accent || undefined }),
    mirrorTheme(style) {
      sheets.targets.add(style)
      style.textContent = sheets.text
      return () => sheets.targets.delete(style)
    },
    dispose: () => vuetify.unmount(),
  }
}
