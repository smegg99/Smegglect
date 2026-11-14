// src/dom/store.ts

export interface Store<T> {
  get: () => T
  set: (next: T) => void
  update: (fn: (cur: T) => T) => void
  subscribe: (fn: (value: T) => void) => () => void
}

/** Immutable snapshots with synchronous notification; listeners are isolated from each other. */
export function createStore<T>(initial: T, onError: (error: unknown) => void): Store<T> {
  let value = initial
  const listeners = new Set<(value: T) => void>()
  const store: Store<T> = {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
      for (const fn of [...listeners]) {
        try {
          fn(value)
        }
        catch (error) {
          onError(error)
        }
      }
    },
    update: fn => store.set(fn(value)),
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  return store
}
