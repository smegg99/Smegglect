// src/dom/scope.ts
// Cleanup registry: every listener, observer, frame, timer and object URL the runtime owns.

export interface Scope {
  listen: <E extends Event = Event>(target: EventTarget, type: string, fn: (event: E) => void, opts?: AddEventListenerOptions) => () => void
  observe: <O extends { disconnect: () => void }>(observer: O) => O
  frame: (fn: FrameRequestCallback) => () => void
  timeout: (fn: () => void, ms: number) => () => void
  objectUrl: (blob: Blob) => string
  add: (dispose: () => void) => () => void
  child: () => Scope
  dispose: () => void
  readonly size: number
  readonly disposed: boolean
}

export function createScope(win: Window & typeof globalThis): Scope {
  const owned = new Set<() => void>()
  let disposed = false

  function add(dispose: () => void) {
    if (disposed) {
      dispose()
      return () => {}
    }
    let done = false
    const run = () => {
      if (done) return
      done = true
      owned.delete(run)
      dispose()
    }
    owned.add(run)
    return run
  }

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
    frame(fn) {
      let cancel = () => {}
      const id = win.requestAnimationFrame((t) => {
        cancel()
        fn(t)
      })
      cancel = add(() => win.cancelAnimationFrame(id))
      return cancel
    },
    timeout(fn, ms) {
      let cancel = () => {}
      const id = win.setTimeout(() => {
        cancel()
        fn()
      }, ms)
      cancel = add(() => win.clearTimeout(id))
      return cancel
    },
    objectUrl(blob) {
      const url = win.URL.createObjectURL(blob)
      add(() => win.URL.revokeObjectURL(url))
      return url
    },
    add,
    child() {
      const inner = createScope(win)
      const release = add(() => inner.dispose())
      inner.add(release)
      return inner
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const run of [...owned].reverse()) run()
    },
    get size() {
      return owned.size
    },
    get disposed() {
      return disposed
    },
  }
  return scope
}
