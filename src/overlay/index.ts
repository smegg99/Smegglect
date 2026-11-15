// src/overlay/index.ts
// Default entry: mount() builds the owned host, the engine and the bundled Vue overlay.

import { createApp, reactive, watch, type App as VueApp } from 'vue'
import type { PresetDef } from '../core/presets'
import { ID_BODY, isId } from '../core/limits'
import { createEngine, type Engine, type EngineState } from '../dom/engine'
import type { BridgeConfig } from '../dom/bridge'
import { createHost, type OwnedHost } from '../dom/host'
import type { ContextProvider, SourceProvider } from '../dom/providers'
import { prefs, type DraftStorage } from '../dom/storage'
import type { HostWindow } from '../dom/window'
import App from './App.vue'
import { DOC, ENGINE, FIXED, INSTANCE, KIT, SAVE, SETTINGS, TRANSLATE } from './context'
import type { Language, SaveBundle, Settings } from './settings'
import { createTranslator, pickLocale, type Locale, type Translate } from './i18n'
import { STYLES } from './styles'
import { installVuetify } from './vuetify'

export type { Language, Placement, PresetUse, SaveBundle, Settings } from './settings'
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

/** Mounted instances by name, shared by every copy of the package on the page through a global symbol. */
function registry(): Map<string, Smegglect> {
  const known: unknown = Reflect.get(globalThis, REGISTRY)
  if (known instanceof Map) return known as Map<string, Smegglect>
  const created = new Map<string, Smegglect>()
  Reflect.set(globalThis, REGISTRY, created)
  return created
}


/** Kept per project; `locale` and `placement`'s share follow from these. */
const REMEMBERED = [
  'theme', 'accent', 'placement', 'offset', 'labels', 'large', 'language', 'shortcuts', 'watchOnly',
  'agentStatus', 'motion', 'steadySize', 'dodge', 'favourites',
] as const

const LANGUAGES: readonly Language[] = ['auto', 'en', 'pl']

/** Which settings the mount options fix; the Settings tab shows them as set by the app. */
function fixedBy(options: MountOptions): Set<keyof Settings> {
  const fixed = new Set<keyof Settings>()
  for (const key of REMEMBERED) if (options[key] !== undefined) fixed.add(key)
  // `locale` is the app's language, the overlay's default: the person can still choose another.
  if (options.bridge?.observer) fixed.add('watchOnly')
  return fixed
}

/** The mount options first, then what this project remembers, then the defaults. */
function initialSettings(
  options: MountOptions,
  kept: Partial<Settings>,
  browser: readonly string[],
): Settings {
  const keptLanguage = LANGUAGES.find(language => language === kept.language) ?? 'auto'
  const chosen = options.language ?? keptLanguage
  return {
    theme: options.theme ?? kept.theme ?? 'auto',
    accent: options.accent ?? (typeof kept.accent === 'string' ? kept.accent : ''),
    placement: options.placement ?? kept.placement ?? 'bottom',
    offset: options.offset ?? (typeof kept.offset === 'number' ? Math.max(0, Math.min(1, kept.offset)) : 0.5),
    labels: options.labels ?? kept.labels ?? true,
    large: options.large ?? kept.large ?? false,
    language: chosen,
    locale: localeFor(options.locale, chosen, browser),
    shortcuts: options.shortcuts ?? kept.shortcuts ?? true,
    watchOnly: options.bridge?.observer || (options.watchOnly ?? kept.watchOnly ?? false),
    agentStatus: options.agentStatus ?? kept.agentStatus ?? true,
    motion: options.motion ?? kept.motion ?? true,
    steadySize: options.steadySize ?? kept.steadySize ?? false,
    dodge: options.dodge ?? kept.dodge ?? true,
    favourites: Array.isArray(kept.favourites) ? kept.favourites.slice(0, 8) : [],
  }
}

/** A chosen language wins; Auto follows the app's `locale` option when it gives one, else the browser. */
function localeFor(appLocale: string | undefined, language: Language, browser: readonly string[]): Locale {
  if (language !== 'auto') return language
  return pickLocale(appLocale ? [appLocale] : browser)
}

/** Writes the remembered settings on every change, and follows a language change in the locale. */
function keepSettings(settings: Settings, win: Window, project: string, appLocale: string | undefined) {
  const remembered = prefs(win, project)
  const browser = [...(win.navigator.languages ?? [win.navigator.language])]
  const stopLocale = watch(() => settings.language, (language) => {
    settings.locale = localeFor(appLocale, language, browser)
  })
  const stopWrite = watch(settings, (current) => {
    remembered.write(Object.fromEntries(REMEMBERED.map(key => [key, current[key]])))
  }, { deep: true })
  return () => {
    stopLocale()
    stopWrite()
  }
}

/** The document to mount in, with its window; outside a browser there is none. */
function documentOf(options: MountOptions): { doc: Document, win: HostWindow } {
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  const win = doc?.defaultView
  if (!doc || !win || !doc.documentElement) {
    throw new Error('smegglect: mount() needs a browser document; call it from client-only code')
  }
  return { doc, win }
}

/** The settings, which of them the mount options fix, and the translator that follows their locale. */
interface Setup {
  settings: Settings
  fixed: ReadonlySet<keyof Settings>
  t: Translate
}

function setUp(options: MountOptions, win: HostWindow, project: string): Setup {
  const browser = [...(win.navigator.languages ?? [win.navigator.language])]
  const kept = prefs(win, project).read<Settings>()
  const settings = reactive<Settings>(initialSettings(options, kept, browser))
  const t = createTranslator(
    () => pickLocale([settings.locale]),
    key => win.console.debug(`smegglect: missing message ${key}`),
  )
  return { settings, fixed: fixedBy(options), t }
}

function startEngine(doc: Document, host: OwnedHost, options: MountOptions, setup: Setup): Engine {
  return createEngine({
    document: doc,
    owns: host.inPath,
    raise: host.raise,
    project: options.project ?? { id: 'default' },
    presets: options.presets,
    testAttributes: options.testAttributes,
    sources: options.sources,
    context: options.context,
    screen: options.screen,
    shortcuts: setup.settings.shortcuts,
    storage: options.storage,
    provider: options.provider,
    bridge: options.bridge,
  })
}

/** What the overlay's components are given. */
interface AppInput {
  engine: Engine
  setup: Setup
  doc: Document
  win: HostWindow
  save: SaveBundle | null
  instance: string
}

/** In the shadow root beside the app: the theme stylesheet, and the layer menus and tooltips open in. */
interface ShadowParts {
  themeStyle: HTMLStyleElement
  layer: HTMLElement
}

function shadowParts(doc: Document, mountPoint: Element): ShadowParts {
  const themeStyle = doc.createElement('style')
  const layer = doc.createElement('div')
  layer.className = 'sg-layer'
  mountPoint.before(themeStyle)
  mountPoint.after(layer)
  return { themeStyle, layer }
}

/** The running overlay app, and how to stop it with its Vuetify. */
interface Started {
  app: VueApp
  stop: () => void
}

function startApp(input: AppInput, mountPoint: Element): Started {
  const app = createApp(App)
  const { settings } = input.setup
  const parts = shadowParts(input.doc, mountPoint)
  // The App sets light or dark once it has read the page; dark until then.
  const kit = installVuetify(app, { ...parts, dark: true, accent: settings.accent })
  app.provide(KIT, kit)
  app.provide(ENGINE, input.engine)
  app.provide(SETTINGS, input.setup.settings)
  app.provide(FIXED, input.setup.fixed)
  app.provide(TRANSLATE, input.setup.t)
  app.provide(DOC, input.doc)
  app.provide(SAVE, input.save)
  app.provide(INSTANCE, input.instance)
  app.config.errorHandler = error => input.win.console.error('smegglect:', error)
  app.mount(mountPoint)
  const stop = () => {
    app.unmount()
    kit.dispose()
    parts.themeStyle.remove()
    parts.layer.remove()
  }
  return { app, stop }
}

/** The mounted overlay as the host holds it; `stop` ends what mount started, in order. */
function handleFor(instance: string, engine: Engine, settings: Settings, stop: () => void): Smegglect {
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
      stop()
      if (registry().get(instance) === handle) registry().delete(instance)
    },
    get destroyed() {
      return destroyed
    },
  }
  return handle
}

export function mount(options: MountOptions = {}): Smegglect {
  const { doc, win } = documentOf(options)
  const instance = options.instance ?? 'default'
  const existing = registry().get(instance)
  if (existing && !existing.destroyed) return existing

  const project = options.project ?? { id: 'default' }
  if (!isId(project.id)) throw new Error(`smegglect: project.id must match ${ID_BODY}`)
  const setup = setUp(options, win, project.id)
  const { settings } = setup
  const host = createHost(doc, { instance, styles: STYLES })
  let started: Started | null = null
  try {
    const engine = startEngine(doc, host, options, setup)
    const stopPrefs = keepSettings(settings, win, project.id, options.locale)
    const stopShortcuts = watch(() => settings.shortcuts, on => engine.setShortcuts(on))
    const appInput = { engine, setup, doc, win, save: options.save ?? null, instance }
    const running = startApp(appInput, host.mountPoint)
    started = running
    if (options.open) engine.setExpanded(true)
    const handle = handleFor(instance, engine, settings, () => {
      stopPrefs()
      stopShortcuts()
      running.stop()
      engine.destroy()
      host.destroy()
    })
    registry().set(instance, handle)
    return handle
  }
  catch (error) {
    started?.stop()
    host.destroy()
    throw error
  }
}

/** Destroys a mounted instance by name; a no-op when none is mounted. */
export function destroy(instance = 'default'): void {
  registry().get(instance)?.destroy()
}
