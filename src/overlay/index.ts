// src/overlay/index.ts
// Default entry: mount() builds the owned host, the engine and the bundled Vue overlay.

import { createApp, reactive, watch, type App as VueApp } from 'vue'
import type { PresetDef } from '../core/presets'
import { createEngine, type Engine, type EngineState } from '../dom/engine'
import type { BridgeConfig } from '../dom/bridge'
import { createHost } from '../dom/host'
import type { ContextProvider, SourceProvider } from '../dom/providers'
import { prefs, type DraftStorage } from '../dom/storage'
import App from './App.vue'
import { DOC, ENGINE, SAVE, SETTINGS, T } from './context'
import type { SaveBundle, Settings } from './settings'
import { createTranslator, pickLocale } from './i18n'
import { STYLES } from './styles'

export type { Placement, PresetUse, SaveBundle, Settings } from './settings'
export type { DraftStorage } from '../dom/storage'
export type { Engine, EngineState } from '../dom/engine'
export type { PresetDef } from '../core/presets'
export type { ContextProvider, SourceProvider } from '../dom/providers'

export interface MountOptions extends Partial<Settings> {
  /** Separate overlays need separate instance names; the same name mounts once. */
  instance?: string
  document?: Document
  project?: { id: string, name?: string }
  locale?: string
  presets?: readonly PresetDef[]
  testAttributes?: readonly string[]
  sources?: readonly SourceProvider[]
  context?: readonly ContextProvider[]
  screen?: () => string | undefined
  shortcuts?: boolean
  /** Start with the dock expanded instead of the launcher. */
  open?: boolean
  /** `auto` (default): IndexedDB, falling back to memory. */
  storage?: 'auto' | 'memory' | DraftStorage
  /** Optional provider evidence for batches, e.g. `{ branch: 'main' }`. */
  provider?: Record<string, string>
  /** Native save, e.g. from the Wails adapter; browser download otherwise. */
  save?: SaveBundle
  /** Local agent bridge address and token; the Vite plugin supplies it in dev when `bridge: true`. */
  bridge?: BridgeConfig
}

export interface Smegglect {
  readonly instance: string
  readonly engine: Engine
  update: (settings: Partial<Settings>) => void
  subscribe: (fn: (state: EngineState) => void) => () => void
  destroy: () => void
  readonly destroyed: boolean
}

const REGISTRY = Symbol.for('smegglect.instances')

function registry(): Map<string, Smegglect> {
  const g = globalThis as unknown as Record<symbol, Map<string, Smegglect> | undefined>
  return g[REGISTRY] ??= new Map()
}

const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/

export function mount(options: MountOptions = {}): Smegglect {
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  if (!doc || !doc.defaultView || !doc.documentElement) {
    throw new Error('smegglect: mount() needs a browser document; call it from client-only code')
  }
  const instance = options.instance ?? 'default'
  const existing = registry().get(instance)
  if (existing && !existing.destroyed) return existing

  const project = options.project ?? { id: 'default' }
  if (!PROJECT_ID.test(project.id)) throw new Error('smegglect: project.id must match [A-Za-z0-9_-]{1,64}')
  const win = doc.defaultView
  const locale = pickLocale(options.locale ? [options.locale] : [...(win.navigator.languages ?? [win.navigator.language])])
  const t = createTranslator(locale, key => win.console.debug(`smegglect: missing message ${key}`))

  const host = createHost(doc, { instance, styles: STYLES })
  let engine: Engine
  let app: VueApp | null = null
  try {
    engine = createEngine({
      document: doc,
      owns: host.inPath,
      raise: host.raise,
      project,
      ...(options.presets ? { presets: options.presets } : {}),
      ...(options.testAttributes ? { testAttributes: options.testAttributes } : {}),
      ...(options.sources ? { sources: options.sources } : {}),
      ...(options.context ? { context: options.context } : {}),
      ...(options.screen ? { screen: options.screen } : {}),
      ...(options.shortcuts !== undefined ? { shortcuts: options.shortcuts } : {}),
      ...(options.storage ? { storage: options.storage } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.bridge ? { bridge: options.bridge } : {}),
    })
    // Explicit options win over remembered preferences; preferences win over defaults.
    const remembered = prefs(win, project.id)
    const kept = remembered.read<Settings>()
    const settings = reactive<Settings>({
      theme: options.theme ?? kept.theme ?? 'auto',
      accent: options.accent ?? '',
      placement: options.placement ?? kept.placement ?? 'bottom',
      side: options.side ?? kept.side ?? 'right',
      labels: options.labels ?? kept.labels ?? true,
      large: options.large ?? kept.large ?? false,
      locale,
      favourites: Array.isArray(kept.favourites) ? kept.favourites.slice(0, 8) : [],
    })
    const stopPrefs = watch(settings, (s) => {
      remembered.write({ theme: s.theme, placement: s.placement, side: s.side, labels: s.labels, large: s.large, favourites: s.favourites })
    }, { deep: true })
    app = createApp(App)
    app.provide(ENGINE, engine)
    app.provide(SETTINGS, settings)
    app.provide(T, t)
    app.provide(DOC, doc)
    app.provide(SAVE, options.save ?? null)
    app.config.errorHandler = error => win.console.error('smegglect:', error)
    app.mount(host.mountPoint)
    if (options.open) engine.setExpanded(true)

    let destroyed = false
    const handle: Smegglect = {
      instance,
      engine,
      update(next) {
        Object.assign(settings, next)
      },
      subscribe: engine.subscribe,
      destroy() {
        if (destroyed) return
        destroyed = true
        stopPrefs()
        app?.unmount()
        app = null
        engine.destroy()
        host.destroy()
        if (registry().get(instance) === handle) registry().delete(instance)
      },
      get destroyed() {
        return destroyed
      },
    }
    registry().set(instance, handle)
    return handle
  }
  catch (error) {
    app?.unmount()
    host.destroy()
    throw error
  }
}

/** Destroys a mounted instance by name; a no-op when none is mounted. */
export function destroy(instance = 'default'): void {
  registry().get(instance)?.destroy()
}
