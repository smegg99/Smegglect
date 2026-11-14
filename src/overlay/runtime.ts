// src/overlay/runtime.ts
// Reactive view of the engine shared by every overlay component.

import { inject, onScopeDispose, reactive, shallowRef, type InjectionKey, type ShallowRef } from 'vue'
import type { Engine, EngineState, Geometry } from '../dom/engine'
import type { SessionState } from '../dom/session'
import { ENGINE, SAVE, SETTINGS, T, type SaveBundle, type Settings } from './context'
import type { Translate } from './i18n'
import type { PanelLayout } from './inspector'

export interface Tip {
  text: string
  kbd?: string
  rect: DOMRect
  side: 'above' | 'below' | 'left' | 'right'
}

export interface Ui {
  /** The side inspector is open. */
  inspector: boolean
  view: 'element' | 'issues' | 'history' | 'issue' | 'report'
  /** Issue shown in the issue view. */
  issue: string | null
  /** Where Back from the issue view returns to. */
  back: 'element' | 'issues' | 'history'
  /** Inspector layout while open, so the toast stays out from under it. */
  panel: PanelLayout | null
  /** Group member under the pointer in the inspector, marked on the page. */
  member: number | null
  /** Folds the person opened or closed in the inspector, by name; unset ones use their default. */
  folds: Record<string, boolean>
  tip: Tip | null
  viewport: { width: number, height: number }
  dock: DOMRect | null
  /** Overlay-level message for the toast, e.g. an export result. */
  message: { id: number, text: string, warn: boolean } | null
  /** Move focus into the dock once it renders (opened from the launcher or the keyboard). */
  focusDock: boolean
  /** Last answer of the optional local bridge; unknown until the Issues tab asks. */
  bridge: 'unknown' | 'connected' | 'offline'
  /** Report panel: a submitted batch or the current drafts, with a failure note when a channel failed. */
  report: { tab: 'summary' | 'markdown', note: string, batchId: string | null } | null
  /** Issue under the pointer in the list or on the page. */
  hover: string | null
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
  doc: Document
}

export const RUNTIME: InjectionKey<Runtime> = Symbol('runtime')

export function createRuntime(doc: Document): Runtime {
  const engine = inject(ENGINE)!
  const settings = inject(SETTINGS)!
  const t = inject(T)!
  const save = inject(SAVE, null)
  const state = shallowRef(engine.state())
  const geo = shallowRef(engine.geometry())
  const sess = shallowRef(engine.session.store.get())
  const win = doc.defaultView!
  const ui = reactive<Ui>({
    inspector: false,
    view: 'element',
    issue: null,
    back: 'issues',
    panel: null,
    folds: {},
    member: null,
    tip: null,
    viewport: { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
    dock: null,
    message: null,
    report: null,
    hover: null,
    focusDock: false,
    bridge: 'unknown',
  })
  const offState = engine.subscribe(s => (state.value = s))
  const offGeo = engine.subscribeGeometry(g => (geo.value = g))
  const offSess = engine.session.store.subscribe(s => (sess.value = s))
  const onResize = () => {
    ui.viewport = { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight }
  }
  win.addEventListener('resize', onResize, { passive: true })
  onScopeDispose(() => {
    offState()
    offGeo()
    offSess()
    win.removeEventListener('resize', onResize)
  })
  return { engine, settings, t, state, geo, sess, save, ui, doc }
}

export function useRuntime(): Runtime {
  return inject(RUNTIME)!
}
