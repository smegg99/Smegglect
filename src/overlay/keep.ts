// src/overlay/keep.ts
// What the overlay showed, kept for this tab through a reload of the page: the dev server reloading it after
// an edit, or Vite reloading Smegglect itself. The session keeps the issues; this keeps the rest.

import { watch } from 'vue'
import { LIMITS } from '../core/limits'
import { cleanLocation } from '../core/redact'
import { isStringMap } from '../core/shape'
import { checkTarget } from '../core/validate'
import type { KeptSelection } from '../dom/engine'
import type { Runtime, Ui } from './runtime'

const SAVE_MS = 150
/** How long the page may take to draw the kept selection before it is given up. */
const FIND_MS = 5000
const VIEWS: readonly string[] = ['element', 'issues', 'history', 'settings', 'issue']
const BACKS: readonly string[] = ['element', 'issues', 'history']
const MODES: readonly string[] = ['inside', 'touching']

/** What the issue form held: the type picked, its option, the note and the scope switch. */
export interface Draft {
  preset: string
  params: Record<string, string>
  note: string
  everywhere: boolean
}

interface Kept {
  location: string
  expanded: boolean
  measuring: boolean
  inspector: boolean
  view: Ui['view']
  issue: string | null
  back: Ui['back']
  folds: Record<string, boolean>
  selection: KeptSelection | null
  draft: Draft | null
}

const isBool = (value: unknown): value is boolean => typeof value === 'boolean'
const isShort = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max

function isSelection(value: unknown): value is KeptSelection {
  if (value === null || typeof value !== 'object') return false
  const { target, page, mode } = value as Record<string, unknown>
  if (checkTarget(target, 'target').length) return false
  const paged = page === undefined || isShort(page, LIMITS.file)
  return paged && (mode === undefined || MODES.includes(mode as string))
}

function isDraft(value: unknown): value is Draft {
  if (value === null || typeof value !== 'object') return false
  const { preset, params, note, everywhere } = value as Record<string, unknown>
  return isShort(preset, LIMITS.name) && isStringMap(params) && isShort(note, LIMITS.note)
    && isBool(everywhere)
}

/** What another script on the page could have written there is checked as any outside data is. */
function isKept(value: unknown): value is Kept {
  if (value === null || typeof value !== 'object') return false
  const kept = value as Record<string, unknown>
  const folds = kept.folds
  return isShort(kept.location, LIMITS.file) && isBool(kept.expanded) && isBool(kept.measuring)
    && isBool(kept.inspector) && VIEWS.includes(kept.view as string) && BACKS.includes(kept.back as string)
    && (kept.issue === null || isShort(kept.issue, LIMITS.name))
    && folds !== null && typeof folds === 'object' && Object.values(folds).every(isBool)
    && (kept.selection === null || isSelection(kept.selection))
    && (kept.draft === null || isDraft(kept.draft))
}

function read(storage: Storage, key: string): Kept | null {
  try {
    const raw = storage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return isKept(parsed) ? parsed : null
  }
  catch {
    // Blocked storage or a value that is not JSON: the overlay starts as it would without a reload.
    return null
  }
}

function snapshot(rt: Runtime, location: string): Kept {
  const { engine, state, ui } = rt
  return {
    location,
    expanded: state.value.expanded,
    measuring: state.value.measuring,
    inspector: ui.inspector,
    view: ui.view,
    issue: ui.issue,
    back: ui.back,
    folds: { ...ui.folds },
    selection: engine.keptSelection(),
    draft: ui.draft,
  }
}

/**
 * Selects what was kept once the page has drawn it: the app may render after the overlay, so each change to
 * the page tries again, for a few seconds.
 */
function findWhenDrawn(rt: Runtime, selection: KeptSelection): () => void {
  const win = rt.doc.defaultView
  if (rt.engine.restoreSelection(selection) || !win?.MutationObserver) return () => {}
  const observer = new win.MutationObserver(() => {
    if (rt.engine.restoreSelection(selection)) stop()
  })
  const timer = win.setTimeout(() => stop(), FIND_MS)
  function stop() {
    observer.disconnect()
    win?.clearTimeout(timer)
  }
  observer.observe(rt.doc.documentElement, { childList: true, subtree: true })
  return stop
}

function restore(rt: Runtime, kept: Kept): () => void {
  const { engine, ui } = rt
  Object.assign(ui, {
    view: kept.view, issue: kept.issue, back: kept.back, folds: kept.folds, draft: kept.draft,
  })
  if (kept.measuring) engine.setMeasuring(true)
  if (kept.expanded) engine.setExpanded(true)
  // The drawer comes back where the person left focus, as when the toolbar unfolds.
  if (kept.inspector) Object.assign(ui, { inspector: true, restored: true })
  return kept.selection ? findWhenDrawn(rt, kept.selection) : () => {}
}

/**
 * Restores what this tab's overlay showed before the page reloaded, then keeps it current: soon after each
 * change, and at once when the page is left. Returns the stop, which keeps it one last time.
 */
export function keepOverlay(rt: Runtime): () => void {
  const { engine, state, ui, doc } = rt
  const win = doc.defaultView
  let storage: Storage
  try {
    if (!win) return () => {}
    storage = win.sessionStorage
  }
  catch {
    // A sandboxed page without storage: nothing is kept, as before.
    return () => {}
  }
  const key = `smegglect:kept:${engine.session.store.get().windowId}`
  const location = () => cleanLocation(win.location.href)
  const kept = read(storage, key)
  const stopFinding = kept && kept.location === location() ? restore(rt, kept) : () => {}
  const save = () => {
    try {
      storage.setItem(key, JSON.stringify(snapshot(rt, location())))
    }
    catch {
      // Full or blocked storage: this reload starts afresh, which is what happened before.
    }
  }
  let timer: number | undefined
  const later = () => {
    win.clearTimeout(timer)
    timer = win.setTimeout(save, SAVE_MS)
  }
  const stops = [
    watch(() => [state.value.expanded, state.value.measuring, state.value.inspect.selection], later),
    watch(() => [ui.inspector, ui.view, ui.issue, ui.back], later),
    watch(() => ({ ...ui.folds }), later),
    watch(() => (ui.draft ? { ...ui.draft } : null), later),
  ]
  win.addEventListener('pagehide', save)
  return () => {
    stopFinding()
    for (const stop of stops) stop()
    win.clearTimeout(timer)
    win.removeEventListener('pagehide', save)
    save()
  }
}
