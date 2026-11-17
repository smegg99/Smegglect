// src/overlay/runtime.ts
// Reactive view of the engine shared by every overlay component.

import {
  inject, nextTick, onScopeDispose, reactive, shallowRef, watch, type InjectionKey, type ShallowRef,
} from 'vue'
import type { ContentsMode } from '../core/contents'
import type { Issue } from '../core/model'
import type { BridgeHealth, BridgeStatus } from '../dom/bridge'
import type { Engine, EngineState, Geometry } from '../dom/engine'
import type { SessionState } from '../dom/session'
import type { HostWindow } from '../dom/window'
import { ENGINE, INSTANCE, KIT, SAVE, SETTINGS, TRANSLATE, type SaveBundle, type Settings } from './context'
import { say } from './exporting'
import type { Translate } from './i18n'
import type { DockSpot, PanelLayout } from './inspector'
import type { Draft } from './keep'
import { canPopOut, openPopout, type Popout } from './popout'
import { STYLES } from './styles'

export interface Tip {
  text: string
  kbd?: string
  /** The document of the element that raised it; the tip shows in that window. */
  doc: Document
  rect: DOMRect
  side: 'above' | 'below' | 'left' | 'right'
}

/** A key on a toast: pressing it acts and closes the toast. */
export interface MessageAction {
  label: string
  run: () => void
}

export interface Ui {
  /** The drawer is open. */
  inspector: boolean
  /** The drawer came back with the unfolded toolbar: it leaves focus where the person put it. */
  restored: boolean
  view: 'element' | 'issues' | 'history' | 'settings' | 'issue'
  /** Issue shown in the issue view. */
  issue: string | null
  /** Where Back from the issue view returns to. */
  back: 'element' | 'issues' | 'history'
  /** Inspector layout while open, so the toast stays out from under it. */
  panel: PanelLayout | null
  /** Group member under the pointer in the inspector, marked on the page. */
  member: number | null
  /** Which elements the region being drawn will select, by the drag's direction; null when not dragging. */
  regionMode: ContentsMode | null
  /** Folds the person opened or closed in the inspector, by name; unset ones use their default. */
  folds: Record<string, boolean>
  tip: Tip | null
  viewport: { width: number, height: number }
  /** The button and its toolbar on the page, and the edge they are on. */
  dock: DockSpot | null
  /** The button is being dragged: the drawer follows it at once, without easing. */
  dragging: boolean
  /** The toolbar in the pop-out window. */
  bar: DOMRect | null
  /** Overlay-level message for the toast, e.g. an export result, with a key that acts on it. */
  message: { id: number, text: string, warn: boolean, action?: MessageAction } | null
  /** Move focus into the dock once it renders (opened from the launcher or the keyboard). */
  focusDock: boolean
  /** Last answer of the optional local bridge; unknown until the Issues tab asks. */
  bridge: 'unknown' | 'connected' | 'offline'
  /** What the bridge said about itself the last time it answered. */
  bridgeHealth: BridgeHealth | null
  /** Whether an agent listens and how far each sent report has got; null until asked. */
  agentStatus: BridgeStatus | null
  /** The sent issue the agent last checked on this page, shown until `until`; null otherwise. */
  checking: { batchId: string, issueId: string, seq: number, until: number, issue: Issue } | null
  /** The sent issue whose target Show on page brought into view, outlined until `until`. */
  pointed: { issue: Issue, until: number } | null
  /** Issue under the pointer in the list or on the page. */
  hover: string | null
  /** Changes to the issue list so far: each lights the Issues tab and key once (see flash.ts). */
  flash: number
  /** What the issue form holds, kept through a reload of the page (keep.ts). */
  draft: Draft | null
}

export interface Runtime {
  engine: Engine
  settings: Settings
  t: Translate
  state: ShallowRef<EngineState>
  geo: ShallowRef<Geometry>
  sess: ShallowRef<SessionState>
  save: SaveBundle | null
  ui: Ui
  /** The page's document. */
  doc: Document
  /** The pop-out window while the toolbar and the panel are in it. */
  popout: ShallowRef<Popout | null>
  canPopOut: boolean
  /**
   * Moves the toolbar and the panel into their own window, for now:
   * the button always opens them on the page.
   */
  popOut: () => void
  /** Back on the page, still open. */
  putBack: () => void
  /**
   * The document the person is working in: the pop-out's while there is one,
   * for focus-bound calls like the clipboard.
   */
  active: () => Document
}

export const RUNTIME: InjectionKey<Runtime> = Symbol('runtime')

/**
 * The window a component is shown in: the page,
 * or the pop-out for the toolbar and the panel while there is one.
 */
export interface Surface {
  readonly doc: Document
  readonly viewport: { width: number, height: number }
  readonly window: boolean
}

export const SURFACE: InjectionKey<Surface> = Symbol('surface')

/** A value the overlay's root provides; asking for it outside the overlay is a programming error. */
function required<T>(key: InjectionKey<T>, name: string): T {
  const value = inject(key)
  if (value === undefined) throw new Error(`smegglect: no ${name} provided`)
  return value
}

export function useSurface(): Surface {
  return required(SURFACE, 'surface')
}

function viewportOf(doc: Document): Ui['viewport'] {
  return { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight }
}

function initialUi(doc: Document): Ui {
  return {
    inspector: false,
    restored: false,
    view: 'element',
    issue: null,
    back: 'issues',
    panel: null,
    folds: {},
    member: null,
    regionMode: null,
    tip: null,
    viewport: viewportOf(doc),
    dock: null,
    dragging: false,
    bar: null,
    message: null,
    hover: null,
    focusDock: false,
    bridge: 'unknown',
    bridgeHealth: null,
    agentStatus: null,
    checking: null,
    pointed: null,
    flash: 0,
    draft: null,
  }
}

type Mirrors = Pick<Runtime, 'state' | 'geo' | 'sess'>

/** The engine's three stores mirrored into refs, and the viewport into `ui`; returns how to stop. */
function mirror(engine: Engine, refs: Mirrors, ui: Ui, win: Window): () => void {
  const stops = [
    engine.subscribe(state => (refs.state.value = state)),
    engine.subscribeGeometry(geometry => (refs.geo.value = geometry)),
    engine.session.store.subscribe(session => (refs.sess.value = session)),
  ]
  const onResize = () => (ui.viewport = viewportOf(win.document))
  win.addEventListener('resize', onResize, { passive: true })
  return () => {
    for (const stop of stops) stop()
    win.removeEventListener('resize', onResize)
  }
}

/** What the pop-out needs from the runtime around it. */
interface WindowNeeds {
  engine: Engine
  ui: Ui
  t: Translate
  instance: string
  /** Says the browser blocked the window. */
  blocked: () => void
  /** Writes Vuetify's theme stylesheet into the window's shadow root too; returns how to stop. */
  mirrorTheme?: (style: HTMLStyleElement) => () => void
}

/** The pop-out window: opening it, and closing it once the toolbar and the panel have left it. */
interface WindowControl {
  popout: ShallowRef<Popout | null>
  open: () => void
  close: () => void
  /** Forgets the window without closing it; returns it, for a caller that closes it now. */
  detach: () => Popout | null
}

function windowControl(win: HostWindow, needs: WindowNeeds): WindowControl {
  const { engine, ui, t } = needs
  const popout = shallowRef<Popout | null>(null)
  let stopKeys: (() => void) | null = null
  let stopTheme: (() => void) | undefined
  const detach = () => {
    stopKeys?.()
    stopKeys = null
    stopTheme?.()
    stopTheme = undefined
    const current = popout.value
    popout.value = null
    return current
  }
  // Closed only once the toolbar and the panel have left it, so nothing is removed with the window.
  const close = () => {
    const current = detach()
    if (current) void nextTick(() => current.close())
  }
  function open() {
    if (popout.value) return
    const onGone = () => {
      detach()
      engine.setExpanded(false)
    }
    const options = { instance: needs.instance, styles: STYLES, title: t('popout.title'), onGone }
    const opened = openPopout(win, options)
    if (!opened) return needs.blocked()
    stopKeys = engine.listenKeys(opened.win)
    const themeStyle = opened.doc.createElement('style')
    opened.mount.before(themeStyle)
    stopTheme = needs.mirrorTheme?.(themeStyle)
    ui.tip = null
    ui.inspector = true
    popout.value = opened
  }
  return { popout, open, close, detach }
}

export function createRuntime(doc: Document): Runtime {
  const engine = required(ENGINE, 'engine')
  const settings = required(SETTINGS, 'settings')
  const t = required(TRANSLATE, 'translator')
  const save = inject(SAVE, null)
  const instance = inject(INSTANCE, 'default')
  const win = doc.defaultView
  if (!win) throw new Error('smegglect: the document has no window')
  const refs = {
    state: shallowRef(engine.state()),
    geo: shallowRef(engine.geometry()),
    sess: shallowRef(engine.session.store.get()),
  }
  const ui = reactive<Ui>(initialUi(doc))
  const stopMirror = mirror(engine, refs, ui, win)
  const blocked = () => say(runtime, t('popout.blocked'), true)
  const mirrorTheme = inject(KIT, null)?.mirrorTheme
  const windows = windowControl(win, { engine, ui, t, instance, blocked, mirrorTheme })
  // The button always opens the overlay on the page; only Pop out moves it. Folding it closes the window.
  watch(() => refs.state.value.expanded, (open) => {
    if (!open) windows.close()
  })
  onScopeDispose(() => {
    stopMirror()
    windows.detach()?.close()
  })
  const runtime: Runtime = {
    engine, settings, t, ...refs, save, ui, doc,
    popout: windows.popout,
    canPopOut: canPopOut(win),
    popOut: windows.open,
    putBack() {
      ui.tip = null
      windows.close()
    },
    active: () => windows.popout.value?.doc ?? doc,
  }
  return runtime
}

export function useRuntime(): Runtime {
  return required(RUNTIME, 'runtime')
}
