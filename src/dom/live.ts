// src/dom/live.ts
// Frame-coalesced geometry for the current selection, candidate and pins. Idle when nothing is tracked.

import type { Rect } from '../core/model'
import { rectOf } from './capture'
import type { Scope } from './scope'

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
  /** Request one sample on the next frame. */
  request: () => void
  readonly listening: boolean
}

export function sameRect(a: Rect | null | undefined, b: Rect | null | undefined): boolean {
  if (!a || !b) return a === b
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function rectOrNull(el: Element | null | undefined): Rect | null {
  return el && el.isConnected ? rectOf(el) : null
}

export function createTracker(win: Window & typeof globalThis, parent: Scope, tracked: () => Tracked, sample: () => void): LiveTracker {
  let scope: Scope | null = null
  let observer: ResizeObserver | null = null
  let observed = new Set<Element>()
  let mutations: MutationObserver | null = null
  let cancel: (() => void) | null = null

  function frame() {
    cancel = null
    if (!scope) return
    sample()
    if (tracked().continuous) request()
  }

  function request() {
    if (!scope || cancel) return
    cancel = scope.frame(frame)
  }

  function observe(elements: readonly Element[]) {
    if (!observer) return
    const next = new Set(elements)
    for (const el of observed) if (!next.has(el)) observer.unobserve(el)
    // Border box: padding and border changes move the drawn outline even when the content box keeps its size.
    for (const el of next) if (!observed.has(el)) observer.observe(el, { box: 'border-box' })
    observed = next
  }

  return {
    sync() {
      const t = tracked()
      if (!t.any) {
        scope?.dispose()
        scope = null
        observer = null
        mutations = null
        observed = new Set()
        cancel = null
        return
      }
      if (!scope) {
        scope = parent.child()
        const opts = { capture: true, passive: true }
        scope.listen(win, 'scroll', request, opts)
        scope.listen(win, 'resize', request, { passive: true })
        if (win.visualViewport) scope.listen(win.visualViewport, 'resize', request, { passive: true })
        scope.listen(win, 'popstate', request)
        scope.listen(win, 'hashchange', request)
        if (typeof win.ResizeObserver === 'function') observer = scope.observe(new win.ResizeObserver(request))
      }
      observe(t.elements)
      if (t.structure && !mutations && typeof win.MutationObserver === 'function') {
        mutations = new win.MutationObserver(request)
        mutations.observe(win.document.documentElement, { childList: true, subtree: true })
        const own = mutations
        scope.add(() => own.disconnect())
      }
      else if (!t.structure && mutations) {
        mutations.disconnect()
        mutations = null
      }
      request()
    },
    request,
    get listening() {
      return scope !== null
    },
  }
}
