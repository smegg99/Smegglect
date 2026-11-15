// src/dom/live.ts
// Frame-coalesced geometry for the current selection, candidate and pins. Idle when nothing is tracked.

import type { Rect } from '../core/model'
import { rectOf, rendered } from './capture'
import type { Scope } from './scope'
import type { HostWindow } from './window'

export interface Tracked {
  /** Elements whose resize should trigger a sample. */
  elements: readonly Element[]
  /** Sample every frame while true (measurements visible on a selection that may animate). */
  continuous: boolean
  /** Watch for added and removed nodes (pins visible: targets can disappear or be re-rendered). */
  structure: boolean
  any: boolean
}

export interface LiveTracker {
  /** Re-reads the tracked set and starts or stops listening. */
  sync: () => void
}

export function sameRect(a: Rect | null | undefined, b: Rect | null | undefined): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function rectOrNull(element: Element | null | undefined): Rect | null {
  return element && rendered(element) ? rectOf(element) : null
}

/** What the tracker's functions share: its inputs, and what it listens with while anything is tracked. */
interface TrackerState {
  win: HostWindow
  parent: Scope
  tracked: () => Tracked
  sample: () => void
  /** Present while listening; disposing it removes every listener and observer below. */
  scope: Scope | null
  observer: ResizeObserver | null
  observed: Set<Element>
  /** Present while added and removed nodes are watched; stops the watching and leaves the scope. */
  unwatch: (() => void) | null
  /** `continuous` as of the last sync: every change to it syncs, so a frame need not build the set again. */
  continuous: boolean
  /** Cancels the sample requested for the next frame. */
  cancel: (() => void) | null
}

function onFrame(state: TrackerState): void {
  state.cancel = null
  if (!state.scope) return
  state.sample()
  if (state.continuous) requestSample(state)
}

function requestSample(state: TrackerState): void {
  if (!state.scope || state.cancel) return
  state.cancel = state.scope.frame(() => onFrame(state))
}

function observe(state: TrackerState, elements: readonly Element[]): void {
  const { observer, observed } = state
  if (!observer) return
  const next = new Set(elements)
  for (const element of observed) if (!next.has(element)) observer.unobserve(element)
  // Border box: padding and border changes move the drawn outline even when the content box keeps its size.
  for (const element of next) if (!observed.has(element)) observer.observe(element, { box: 'border-box' })
  state.observed = next
}

/** Nothing is tracked: every listener and observer goes. */
function stopTracking(state: TrackerState): void {
  state.scope?.dispose()
  state.scope = null
  state.observer = null
  state.unwatch = null
  state.observed = new Set()
  state.continuous = false
  state.cancel = null
}

/** Starts listening for whatever moves a tracked box: scrolling, resizing and history changes. */
function startListening(state: TrackerState, request: () => void): Scope {
  const win = state.win
  const scope = state.parent.child()
  state.scope = scope
  const opts = { capture: true, passive: true }
  scope.listen(win, 'scroll', request, opts)
  scope.listen(win, 'resize', request, { passive: true })
  if (win.visualViewport) scope.listen(win.visualViewport, 'resize', request, { passive: true })
  scope.listen(win, 'popstate', request)
  scope.listen(win, 'hashchange', request)
  if (typeof win.ResizeObserver === 'function') state.observer = scope.observe(
    new win.ResizeObserver(request),
  )
  return scope
}

function watchStructure(state: TrackerState, scope: Scope, structure: boolean, request: () => void): void {
  const win = state.win
  if (structure && !state.unwatch && typeof win.MutationObserver === 'function') {
    const own = new win.MutationObserver(request)
    own.observe(win.document.documentElement, { childList: true, subtree: true })
    state.unwatch = scope.add(() => own.disconnect())
  }
  else if (!structure && state.unwatch) {
    state.unwatch()
    state.unwatch = null
  }
}

function sync(state: TrackerState, request: () => void): void {
  const wanted = state.tracked()
  if (!wanted.any) {
    stopTracking(state)
    return
  }
  const scope = state.scope ?? startListening(state, request)
  state.continuous = wanted.continuous
  observe(state, wanted.elements)
  watchStructure(state, scope, wanted.structure, request)
  request()
}

export function createTracker(
  win: HostWindow,
  parent: Scope,
  tracked: () => Tracked,
  sample: () => void,
): LiveTracker {
  const state: TrackerState = {
    win,
    parent,
    tracked,
    sample,
    scope: null,
    observer: null,
    observed: new Set(),
    unwatch: null,
    continuous: false,
    cancel: null,
  }
  // Every listener and observer calls this one function.
  const request = () => requestSample(state)
  return { sync: () => sync(state, request) }
}
