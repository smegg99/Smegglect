// src/dom/engine/escape.ts
// Escape closes the innermost thing open: a menu, the issue form, a page-click mode, an issue or report view,
// the selection, the inspector. UI layers register their close handlers here.

import { escape as escapeState } from '../../core/modes'
import { cancelCompose } from './compose'
import type { EngineContext } from './context'
import { choosing, setInspect } from './inspect'
import type { Engine, LayerOrder } from './types'

/** Closes one handler from the end of the list; false when it was empty. */
function closeLast(list: (() => void)[]): boolean {
  const close = list.pop()
  close?.()
  return !!close
}

export function escape(context: EngineContext): boolean {
  const { layers, store } = context
  if (closeLast(layers.first)) return true
  if (store.get().composing) {
    cancelCompose(context)
    return true
  }
  const inspect = store.get().inspect
  if (inspect.mode.kind === 'pass' && closeLast(layers.view)) return true
  const next = escapeState(inspect)
  if (!next) return closeLast(layers.last)
  if (choosing(inspect.mode)) context.live.pending = null
  setInspect(context, next)
  return true
}

function pushLayer(context: EngineContext, close: () => void, order: LayerOrder): () => void {
  const list = context.layers[order]
  list.push(close)
  return () => {
    const index = list.lastIndexOf(close)
    if (index >= 0) list.splice(index, 1)
  }
}

export function escapeApi(context: EngineContext): Pick<Engine, 'escape' | 'pushLayer'> {
  return {
    escape: () => escape(context),
    pushLayer: (close, order = 'first') => pushLayer(context, close, order),
  }
}
