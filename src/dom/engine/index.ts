// src/dom/engine/index.ts
// Headless engine: modes, selection, issues and live geometry. Any UI can drive it.
// Each concern has its own file; they share one context object (context.ts).

import { bridgeClient } from '../bridge'
import { createKeys } from '../keys'
import { composeApi } from './compose'
import { createBase, type EngineContext } from './context'
import { escapeApi } from './escape'
import { inspectApi } from './inspect'
import { issuesApi } from './issues'
import type { Engine, EngineOptions } from './types'
import { createServices, followTopLayer, keyHooks, setExpanded } from './wiring'

export type {
  ApplyResult, Engine, EngineOptions, EngineState, Geometry, Notice, SelectedInfo,
} from './types'
export type { KeptSelection } from './keep'

function destroy(context: EngineContext, stopKeys: () => void): void {
  const { live, layers } = context
  if (live.destroyed) return
  live.destroyed = true
  context.picker.stop()
  context.hover.stop()
  stopKeys()
  context.scope.dispose()
  live.hovered = null
  live.pointer = null
  live.space = null
  live.described = null
  live.pending = null
  live.draft = null
  layers.first.length = 0
  layers.view.length = 0
  layers.last.length = 0
}

export function createEngine(options: EngineOptions): Engine {
  const base = createBase(options)
  const context: EngineContext = { ...base, ...createServices(base, () => context) }
  const { store, geometry, scope, win } = context
  let shortcuts = options.shortcuts !== false
  const hooks = keyHooks(context, () => shortcuts)
  const keys = createKeys(win, scope, hooks)
  followTopLayer(context)
  return {
    registry: context.registry,
    session: context.session,
    bridge: options.bridge ? bridgeClient(win, options.bridge) : null,
    state: store.get,
    subscribe: store.subscribe,
    geometry: geometry.get,
    subscribeGeometry: geometry.subscribe,
    setExpanded: on => setExpanded(context, on),
    setShortcuts(on) {
      shortcuts = on
    },
    listenKeys: other => createKeys(other, scope, { ...hooks, owns: () => true }).stop,
    ...inspectApi(context),
    ...composeApi(context),
    ...issuesApi(context),
    ...escapeApi(context),
    objectUrl(blob, ttl) {
      const { url, revoke } = scope.objectUrl(blob)
      // Revoking also removes the scope's entry for it.
      scope.timeout(revoke, ttl)
      return url
    },
    destroy: () => destroy(context, keys.stop),
  }
}
