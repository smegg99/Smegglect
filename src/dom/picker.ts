// src/dom/picker.ts
// Owns the pointer sequence only while a pick, region or reference mode is active.

import type { Scope } from './scope'

export interface PickerHooks {
  /** True when the event passed through Smegglect's own UI. */
  owned: (event: Event) => boolean
  /** True when the event hit a Smegglect shield that stands in for host content (an iframe). */
  shielded: (event: Event) => boolean
  /** Host element under a point, skipping Smegglect's own tree. */
  under: (x: number, y: number) => Element | null
  hover: (el: Element | null) => void
  pick: (el: Element, event: PointerEvent) => void
}

/** Every event that could activate, focus, select text in or submit a host control. */
const BLOCKED = ['pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'touchstart', 'touchend', 'dragstart'] as const

/** Deepest element under the event, through open shadow roots. */
export function deepTarget(event: Event): Element | null {
  for (const node of event.composedPath()) {
    if ((node as Node).nodeType === 1) return node as Element
  }
  return null
}

export interface Picker {
  active: () => boolean
  start: () => void
  stop: () => void
}

/** Longest wait, after the release, for the click that follows a pick-ending press; a drag may never produce one. */
const TAIL_MS = 1000

export function createPicker(win: Window & typeof globalThis, parent: Scope, hooks: PickerHooks): Picker {
  let scope: Scope | null = null
  /** Blockers kept after a pick ended the mode, until mouseup and click of that same press have passed. */
  let tail: Scope | null = null
  let pressed = false
  let pending: Element | null = null
  let cancelFrame: (() => void) | null = null

  function endTail() {
    tail?.dispose()
    tail = null
    pressed = false
  }

  function block(event: Event) {
    if (hooks.owned(event) && !hooks.shielded(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    // A long press releases late; the wait for its click starts at the release.
    if (event.type === 'pointerup') tail?.timeout(endTail, TAIL_MS)
    if (event.type !== 'click' && event.type !== 'auxclick' && event.type !== 'contextmenu') return
    pressed = false
    tail?.timeout(endTail, 0)
  }

  function hostTarget(event: PointerEvent): Element | null {
    if (hooks.shielded(event)) return hooks.under(event.clientX, event.clientY)
    return hooks.owned(event) ? null : deepTarget(event)
  }

  function onDown(event: PointerEvent) {
    // A new press after the mode ended belongs to the host.
    if (!scope) {
      endTail()
      return
    }
    if (hooks.owned(event) && !hooks.shielded(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.button !== 0) return
    pressed = true
    const el = hostTarget(event)
    if (el) hooks.pick(el, event)
  }

  function onMove(event: PointerEvent) {
    pending = hostTarget(event)
    if (cancelFrame || !scope) return
    cancelFrame = scope.frame(() => {
      cancelFrame = null
      hooks.hover(pending)
    })
  }

  return {
    active: () => scope !== null,
    start() {
      if (scope) return
      endTail()
      scope = parent.child()
      const capture = { capture: true, passive: false }
      scope.listen<PointerEvent>(win, 'pointerdown', onDown, capture)
      for (const type of BLOCKED) scope.listen(win, type, block, capture)
      scope.listen<PointerEvent>(win, 'pointermove', onMove, { capture: true, passive: true })
      scope.listen(win.document, 'mouseleave', () => hooks.hover(null), { passive: true })
    },
    stop() {
      if (!scope) return
      const ending = scope
      scope = null
      cancelFrame = null
      pending = null
      hooks.hover(null)
      const held = pressed
      endTail()
      if (!held) {
        ending.dispose()
        return
      }
      // A pick ended the mode on pointerdown: keep stopping the rest of that press, until its click,
      // a key press (a keyboard click must reach the host) or the next press.
      tail = ending
      ending.listen(win, 'keydown', endTail, { capture: true })
    },
  }
}

export interface Hover {
  start: () => void
  stop: () => void
}

/** Reports the host element under the pointer without cancelling anything, for measuring in normal use. */
export function createHover(win: Window & typeof globalThis, parent: Scope, hooks: { owned: (event: Event) => boolean, hover: (el: Element | null) => void }): Hover {
  let scope: Scope | null = null
  let pending: Element | null = null
  let cancelFrame: (() => void) | null = null

  function onMove(event: PointerEvent) {
    pending = hooks.owned(event) ? null : deepTarget(event)
    if (cancelFrame || !scope) return
    cancelFrame = scope.frame(() => {
      cancelFrame = null
      hooks.hover(pending)
    })
  }

  return {
    start() {
      if (scope) return
      scope = parent.child()
      scope.listen<PointerEvent>(win, 'pointermove', onMove, { capture: true, passive: true })
      scope.listen(win.document, 'mouseleave', () => hooks.hover(null), { passive: true })
    },
    stop() {
      if (!scope) return
      scope.dispose()
      scope = null
      cancelFrame = null
      pending = null
      hooks.hover(null)
    },
  }
}
