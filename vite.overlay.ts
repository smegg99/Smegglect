// vite.overlay.ts
// What every Vite build of the overlay shares: Vue, Vuetify without the CSS its components import, and one copy
// of Vue and Vuetify for the overlay and S99AB.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import vue from '@vitejs/plugin-vue'
import type { Alias, Plugin, UserConfig } from 'vite'

const EMPTY = '\0smegglect:empty-css'

/**
 * Vuetify's components import their own CSS, which a library build would extract to a file the shadow root never
 * sees; the overlay injects all of Vuetify's CSS into its shadow root instead (src/overlay/vuetify/styles.ts).
 */
function dropVuetifyCss(): Plugin {
  return {
    name: 'smegglect:drop-vuetify-css',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !/\.(css|sass|scss)$/.test(source)) return null
      return /[\\/]vuetify[\\/]lib[\\/]/.test(importer) ? EMPTY : null
    },
    load(id) {
      return id === EMPTY ? '' : null
    },
  }
}

export const overlayPlugins = () => [vue(), dropVuetifyCss()]

const vuetifyLib = join(dirname(createRequire(import.meta.url).resolve('vuetify/package.json')), 'lib')

/** Vuetify's package exports leave out its components' stylesheets, which the shadow root takes one by one. */
export const overlayAliases: Alias[] = [{ find: /^vuetify\/lib\/(.*)$/, replacement: `${vuetifyLib}/$1` }]

/** S99AB's imports of Vue and Vuetify must reach the overlay's own copies, wherever it is installed from. */
export const overlayResolve: UserConfig['resolve'] = { dedupe: ['vue', 'vuetify'], alias: overlayAliases }

/**
 * A dev server pre-bundles dependencies without plugins, so Vuetify's component CSS would reach the host page's
 * head; served as plain modules, it goes through dropVuetifyCss like the library build.
 */
export const overlayOptimizeDeps: UserConfig['optimizeDeps'] = { exclude: ['vuetify'] }
