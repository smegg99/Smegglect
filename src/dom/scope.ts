// src/dom/scope.ts
// Cleanup registry: every listener, observer, frame, timer and object URL the runtime owns.

import type { HostWindow } from './window'

/** An object URL the scope revokes when it ends; `revoke` lets it go sooner. */
export interface OwnedUrl {
  url: string
  revoke: () => void
}

export interface Scope {
  listen: <E extends Event = Event>(
    target: EventTarget,
    type: string,
    fn: (event: E) => void,
    opts?: AddEventListenerOptions,
  ) => () => void
  observe: <O extends { disconnect: () => void }>(observer: O) => O
  frame: (fn: FrameRequestCallback) => () => void
  timeout: (fn: () => void, ms: number) => () => void
  objectUrl: (blob: Blob) => OwnedUrl
  add: (dispose: () => void) => () => void
  child: () => Scope
  dispose: () => void
}

/** What a scope's functions share: its window, its cleanups in the order added, and whether it ended. */
interface ScopeState {
  win: HostWindow
  owned: Set<() => void>
  disposed: boolean
}

/** Registers a cleanup and returns a function that runs it early, once; a disposed scope runs it at once. */
function addTo(state: ScopeState, dispose: () => void): () => void {
  if (state.disposed) {
    dispose()
    return () => {}
  }
  let done = false
  const run = () => {
    if (done) return
    done = true
    state.owned.delete(run)
    dispose()
  }
  state.owned.add(run)
  return run
}

function frameIn(state: ScopeState, fn: FrameRequestCallback): () => void {
  let cancel = () => {}
  const id = state.win.requestAnimationFrame((time) => {
    cancel()
    fn(time)
  })
  cancel = addTo(state, () => state.win.cancelAnimationFrame(id))
  return cancel
}

function timeoutIn(state: ScopeState, fn: () => void, ms: number): () => void {
  let cancel = () => {}
  const id = state.win.setTimeout(() => {
    cancel()
    fn()
  }, ms)
  cancel = addTo(state, () => state.win.clearTimeout(id))
  return cancel
}

/** Runs every cleanup still owned, the latest first. */
function disposeAll(state: ScopeState): void {
  if (state.disposed) return
  state.disposed = true
  for (const run of [...state.owned].reverse()) run()
}

export function createScope(win: HostWindow): Scope {
  const state: ScopeState = { win, owned: new Set(), disposed: false }
  const add = (dispose: () => void) => addTo(state, dispose)

  const scope: Scope = {
    listen(target, type, fn, opts) {
      const handler = fn as EventListener
      target.addEventListener(type, handler, opts)
      return add(() => target.removeEventListener(type, handler, opts))
    },
    observe(observer) {
      add(() => observer.disconnect())
      return observer
    },
    frame: fn => frameIn(state, fn),
    timeout: (fn, ms) => timeoutIn(state, fn, ms),
    objectUrl(blob) {
      const url = win.URL.createObjectURL(blob)
      return { url, revoke: add(() => win.URL.revokeObjectURL(url)) }
    },
    add,
    child() {
      const inner = createScope(win)
      const release = add(() => inner.dispose())
      inner.add(release)
      return inner
    },
    dispose: () => disposeAll(state),
  }
  return scope
}
