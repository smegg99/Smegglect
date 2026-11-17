// src/dom/engine/wiring.ts
// The engine's links to the page and the person: the session, the tracker, picker and hover, the keys,
// opening and folding, and the host's top layer.

import type { Point } from '../../core/modes'
import { under } from '../describe'
import type { KeyHooks, ShortcutAction } from '../keys'
import { createTracker } from '../live'
import { createHover, createPicker } from '../picker'
import { createSession } from '../session'
import { cancelCompose, onPick } from './compose'
import { patch, type EngineBase, type EngineContext, type Services } from './context'
import { escape } from './escape'
import { sample, tracked } from './geometry'
import { dispatch, onHover, refind, setInspect, setMeasuring, syncHover } from './inspect'
import { redo, replaceDrafts, undo } from './issues'

/** Overlay parts that shield the page: a click on them never picks. Duck-typed, for a pop-out's realm. */
function isShield(node: EventTarget): boolean {
  return 'hasAttribute' in node && (node as Element).hasAttribute('data-shield')
}

/** The services call back into the engine through `context`, which exists by the time they call. */
export function createServices(base: EngineBase, context: () => EngineContext): Services {
  const { win, scope, options, doc, store, onError } = base
  const session = createSession({
    win,
    project: options.project,
    storage: options.storage ?? 'auto',
    registry: base.registry,
    provider: options.provider,
    scope,
    drafts: () => store.get().drafts,
    setDrafts: drafts => replaceDrafts(context(), drafts),
    onError,
  })
  // Before each sample, a selection whose elements the page replaced is moved onto their successors.
  const tracker = createTracker(win, scope, () => tracked(base), () => {
    if (refind(base)) tracker.sync()
    sample(base)
  })
  const hovered = (element: Element | null, point?: Point) => onHover(context(), element, point)
  const picker = createPicker(win, scope, {
    owned: options.owns,
    shielded: event => options.owns(event) && event.composedPath().some(isShield),
    under: (x, y) => under(doc, x, y),
    hover: hovered,
    pick: (element, event) => {
      onPick(context(), element, event).catch(onError)
    },
  })
  // Measuring in normal use: the host keeps every event; only the element under the pointer is read.
  const hover = createHover(win, scope, { owned: options.owns, hover: hovered })
  return { session, tracker, picker, hover }
}

export function setExpanded(context: EngineContext, on: boolean): void {
  const { store } = context
  if (on === store.get().expanded) return
  if (!on) {
    context.live.pending = null
    cancelCompose(context)
    setInspect(context, { mode: { kind: 'pass' }, selection: store.get().inspect.selection })
  }
  patch(context, { expanded: on })
  syncHover(context)
  // Drafts restored while folded have no plates yet; folding stops the tracker.
  context.tracker.sync()
  sample(context)
  if (on) context.options.raise?.()
}

/** The Alt+Shift shortcuts other than the one that opens: each works only while the toolbar is open. */
const TOOLBAR_SHORTCUTS: Record<Exclude<ShortcutAction, 'toggle'>, (context: EngineContext) => void> = {
  pick: context => dispatch(context, { type: 'toggle-pick' }),
  region: context => dispatch(context, { type: 'toggle-region' }),
  measure: context => setMeasuring(context, !context.store.get().measuring),
  undo,
  redo,
}

function toggleOpen(context: EngineContext): void {
  const open = !context.store.get().expanded
  setExpanded(context, open)
  if (open) patch(context, { focusRequest: context.store.get().focusRequest + 1 })
}

/** `shortcuts` is read on every key, so turning them off reaches every window that listens. */
export function keyHooks(context: EngineContext, shortcuts: () => boolean): KeyHooks {
  const { store, layers, options } = context
  return {
    owns: options.owns,
    escape: (focusInHost) => {
      // A bare selection is only cleared from Smegglect's own focus; host fields keep their Escape.
      const bare = !layers.first.length && store.get().inspect.mode.kind === 'pass'
      if (focusInHost && bare) return false
      return escape(context)
    },
    shortcut(action) {
      if (action === 'toggle') return toggleOpen(context)
      if (store.get().expanded) TOOLBAR_SHORTCUTS[action](context)
    },
    shortcuts,
  }
}

/** Host dialogs and popovers enter the top layer above the overlay; raise it again after them. */
export function followTopLayer(context: EngineBase): void {
  const { raise, owns } = context.options
  if (!raise) return
  context.scope.listen(context.doc, 'toggle', (event: Event) => {
    if ((event as ToggleEvent).newState === 'open' && !owns(event)) raise()
  }, { capture: true })
}
