// src/dom/storage/browser.ts
// Small per-project values in the browser's own storage: remembered settings and the tab's window id.

import { isId } from '../../core/limits'

/** A project's remembered settings; failures only mean they are not remembered. */
export interface Prefs {
  read: <T>() => Partial<T>
  /** False when the browser refused to keep them. */
  write: (value: object) => boolean
}

export function prefs(win: Window, project: string): Prefs {
  const key = `smegglect:prefs:${project}`
  return {
    read<T>(): Partial<T> {
      try {
        const raw = win.localStorage.getItem(key)
        const parsed: unknown = raw ? JSON.parse(raw) : {}
        return parsed && typeof parsed === 'object' ? parsed as Partial<T> : {}
      }
      catch {
        // Blocked storage or a value that is not JSON: nothing is remembered, and the defaults apply.
        return {}
      }
    },
    write(value) {
      try {
        win.localStorage.setItem(key, JSON.stringify(value))
        return true
      }
      catch {
        // Full or blocked storage: the setting holds until the page reloads.
        return false
      }
    },
  }
}

/** This tab's window identity, which survives a reload of the tab; null when the tab has none yet. */
export function tabWindow(win: Window, project: string): string | null {
  try {
    const stored = win.sessionStorage.getItem(`smegglect:window:${project}`)
    return stored && isId(stored) ? stored : null
  }
  catch {
    // Without sessionStorage each load is a new window, so two tabs never share drafts.
    return null
  }
}

export function forkWindow(win: Window, project: string, id: string): void {
  try {
    win.sessionStorage.setItem(`smegglect:window:${project}`, id)
  }
  catch {
    // Without sessionStorage the fork lasts until reload, which still avoids the conflict now.
  }
}

/** The window this project last saved drafts from, in any tab or run of the app. */
export function lastWindow(win: Window, project: string): string | null {
  try {
    const stored = win.localStorage.getItem(`smegglect:last-window:${project}`)
    return stored && isId(stored) ? stored : null
  }
  catch {
    return null
  }
}

export function rememberWindow(win: Window, project: string, id: string): void {
  try {
    win.localStorage.setItem(`smegglect:last-window:${project}`, id)
  }
  catch {
    // Without localStorage a new window cannot find the last window's drafts, and starts empty.
  }
}
