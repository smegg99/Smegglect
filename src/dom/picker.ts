// src/dom/picker.ts
// Owns the pointer sequence only while a page-click mode (pick, reference or anchor) is active, and reports
// the element under the pointer while measuring in normal use.

import type { Point } from '../core/modes'
import type { Scope } from './scope'
import type { HostWindow } from './window'

interface PickerHooks {
  /** True when the event passed through Smegglect's own UI. */
  owned: (event: Event) => boolean
  /** True when the event hit a Smegglect shield that stands in for host content (an iframe). */
  shielded: (event: Event) => boolean
  /** Host element under a point, skipping Smegglect's own tree. */
  under: (x: number, y: number) => Element | null
  /** The element under the pointer, and where the pointer is, so a space inside it can be told apart. */
  hover: (element: Element | null, point?: Point) => void
  pick: (element: Element, event: PointerEvent) => void
}

/** Every event that could activate, focus, select text in or submit a host control. */
const BLOCKED = [
  'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick',
  'auxclick', 'contextmenu', 'touchstart', 'touchend', 'dragstart',
] as const

/** Deepest element under the event, through open shadow roots. */
function deepTarget(event: Event): Element | null {
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

/**
 * Longest wait, after the release, for the click that follows a pick-ending press;
 * a drag may never produce one.
 */
const TAIL_MS = 1000

/** The pointer as last moved, reported to `hover` once per frame while `scope` is listening. */
interface Pointer {
  scope: Scope | null
  pending: Element | null
  point: Point | undefined
  cancelFrame: (() => void) | null
}

/** What the picker's functions share: its inputs, the mode's scope, and the press and hover in progress. */
interface PickerState extends Pointer {
  win: HostWindow
  parent: Scope
  hooks: PickerHooks
  /** Blockers kept after a pick ended the mode, until mouseup and click of that same press have passed. */
  tail: Scope | null
  pressed: boolean
}

const idle = (): Pointer => ({ scope: null, pending: null, point: undefined, cancelFrame: null })

/** Keeps the latest place and reports it on the next frame, once however often the pointer moved. */
function onMove(
  pointer: Pointer,
  hover: PickerHooks['hover'],
  element: Element | null,
  event: PointerEvent,
): void {
  pointer.pending = element
  pointer.point = { x: event.clientX, y: event.clientY }
  if (pointer.cancelFrame || !pointer.scope) return
  pointer.cancelFrame = pointer.scope.frame(() => {
    pointer.cancelFrame = null
    hover(pointer.pending, pointer.point)
  })
}

/** Ends the hover: a frame still waiting is cancelled, so nothing is reported after this. */
function endPointer(pointer: Pointer, hover: PickerHooks['hover']): void {
  pointer.cancelFrame?.()
  pointer.cancelFrame = null
  pointer.pending = null
  hover(null)
}

/** The picker's listeners, made once per picker, so every mode adds the same functions. */
interface PickerListeners {
  down: (event: PointerEvent) => void
  block: (event: Event) => void
  move: (event: PointerEvent) => void
  endTail: () => void
}

function endTail(state: PickerState): void {
  state.tail?.dispose()
  state.tail = null
  state.pressed = false
}

function block(state: PickerState, event: Event): void {
  const hooks = state.hooks
  if (hooks.owned(event) && !hooks.shielded(event)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  // A long press releases late; the wait for its click starts at the release.
  if (event.type === 'pointerup') state.tail?.timeout(() => endTail(state), TAIL_MS)
  if (event.type !== 'click' && event.type !== 'auxclick' && event.type !== 'contextmenu') return
  state.pressed = false
  state.tail?.timeout(() => endTail(state), 0)
}

function hostTarget(hooks: PickerHooks, event: PointerEvent): Element | null {
  if (hooks.shielded(event)) return hooks.under(event.clientX, event.clientY)
  return hooks.owned(event) ? null : deepTarget(event)
}

function onDown(state: PickerState, event: PointerEvent): void {
  const hooks = state.hooks
  // A new press after the mode ended belongs to the host.
  if (!state.scope) {
    endTail(state)
    return
  }
  if (hooks.owned(event) && !hooks.shielded(event)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.button !== 0) return
  state.pressed = true
  const element = hostTarget(hooks, event)
  if (element) hooks.pick(element, event)
}

function start(state: PickerState, listeners: PickerListeners): void {
  if (state.scope) return
  endTail(state)
  const win = state.win
  const scope = state.parent.child()
  state.scope = scope
  const capture = { capture: true, passive: false }
  scope.listen<PointerEvent>(win, 'pointerdown', listeners.down, capture)
  for (const type of BLOCKED) scope.listen(win, type, listeners.block, capture)
  scope.listen<PointerEvent>(win, 'pointermove', listeners.move, { capture: true, passive: true })
  scope.listen(win.document, 'mouseleave', () => state.hooks.hover(null), { passive: true })
}

function stop(state: PickerState, listeners: PickerListeners): void {
  if (!state.scope) return
  const ending = state.scope
  state.scope = null
  endPointer(state, state.hooks.hover)
  const held = state.pressed
  endTail(state)
  if (!held) {
    ending.dispose()
    return
  }
  // A pick ended the mode on pointerdown: keep stopping the rest of that press, until its click,
  // a key press (a keyboard click must reach the host) or the next press.
  state.tail = ending
  ending.listen(state.win, 'keydown', listeners.endTail, { capture: true })
}

export function createPicker(win: HostWindow, parent: Scope, hooks: PickerHooks): Picker {
  const state: PickerState = { ...idle(), win, parent, hooks, tail: null, pressed: false }
  const listeners: PickerListeners = {
    down: event => onDown(state, event),
    block: event => block(state, event),
    move: event => onMove(state, hooks.hover, hostTarget(hooks, event), event),
    endTail: () => endTail(state),
  }
  return {
    active: () => state.scope !== null,
    start: () => start(state, listeners),
    stop: () => stop(state, listeners),
  }
}

export interface Hover {
  start: () => void
  stop: () => void
}

/** Reports the host element under the pointer without cancelling anything, for measuring in normal use. */
export function createHover(
  win: HostWindow,
  parent: Scope,
  hooks: Pick<PickerHooks, 'owned' | 'hover'>,
): Hover {
  const pointer = idle()
  const move = (event: PointerEvent) => {
    onMove(pointer, hooks.hover, hooks.owned(event) ? null : deepTarget(event), event)
  }
  return {
    start() {
      if (pointer.scope) return
      const scope = parent.child()
      pointer.scope = scope
      scope.listen<PointerEvent>(win, 'pointermove', move, { capture: true, passive: true })
      scope.listen(win.document, 'mouseleave', () => hooks.hover(null), { passive: true })
    },
    stop() {
      if (!pointer.scope) return
      pointer.scope.dispose()
      pointer.scope = null
      endPointer(pointer, hooks.hover)
    },
  }
}
