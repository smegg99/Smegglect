// src/overlay/popout.ts
// The pop-out window: an ordinary popup window beside the page,
// into which the overlay's toolbar and panel move live.

import { reactive } from 'vue'
import { createHost, HOST_TAG } from '../dom/host'
import type { HostWindow } from '../dom/window'

export interface Popout {
  win: HostWindow
  doc: Document
  /** Where the toolbar and the panel are moved to. */
  mount: HTMLElement
  /** The window's own viewport, reactive. */
  viewport: { width: number, height: number }
  /** Closes the window on purpose; `onGone` is not called for it. */
  close: () => void
}

export interface PopoutOptions {
  instance: string
  styles: readonly string[]
  title: string
  /** The window went away by itself: closed by the person, or with the page. */
  onGone: () => void
}

const WIDTH = 420

/** Popup windows exist for web pages; a desktop app's custom-scheme window has none to give. */
export function canPopOut(win: Window): boolean {
  return /^https?:$/.test(win.location.protocol)
}

/** The named popup at the right of the browser window; null when the browser refused it. */
function openWindow(win: HostWindow, instance: string): HostWindow | null {
  const height = Math.min(860, Math.round((win.screen?.availHeight || 900) * 0.85))
  const left = Math.max(0, win.screenX + win.outerWidth - WIDTH - 24)
  const top = Math.max(0, win.screenY + 80)
  try {
    // The popup is this page's own window, of the same origin and realm.
    const features = `popup,width=${WIDTH},height=${height},left=${left},top=${top}`
    const opened = win.open('', `smegglect-${instance}`, features)
    return opened as HostWindow | null
  }
  catch {
    // A sandboxed frame throws instead of returning null; either way there is no window.
    return null
  }
}

/** The window's viewport as a reactive value that follows its resizes. */
function followViewport(other: HostWindow): Popout['viewport'] {
  const root = other.document.documentElement
  const viewport = reactive({ width: root.clientWidth, height: root.clientHeight })
  other.addEventListener('resize', () => {
    viewport.width = root.clientWidth
    viewport.height = root.clientHeight
  })
  return viewport
}

/**
 * Calls `onGone` once when the window goes away by itself, and closes it with the page; the returned
 * function ends the watch without calling `onGone`.
 */
function watchGone(win: HostWindow, other: HostWindow, onGone: () => void): () => void {
  let done = false
  const withPage = () => other.close()
  const finish = (gone: boolean) => {
    if (done) return
    done = true
    win.clearInterval(poll)
    win.removeEventListener('pagehide', withPage)
    if (gone) onGone()
  }
  other.addEventListener('pagehide', () => finish(true))
  // A popup closed from its own title bar does not always say so.
  const poll = win.setInterval(() => {
    if (other.closed) finish(true)
  }, 500)
  win.addEventListener('pagehide', withPage)
  return () => finish(false)
}

/** Opens the window at the right of the browser window; null when the browser refused (a popup blocker). */
export function openPopout(win: HostWindow, options: PopoutOptions): Popout | null {
  const other = openWindow(win, options.instance)
  if (!other) return null
  const doc = other.document
  doc.title = options.title
  // A named popup kept from an earlier pop-out may still hold its host.
  for (const old of doc.querySelectorAll(HOST_TAG)) old.remove()
  if (doc.body) doc.body.style.margin = '0'
  const host = createHost(doc, { instance: options.instance, styles: options.styles })
  const viewport = followViewport(other)
  other.focus()
  const stopWatching = watchGone(win, other, options.onGone)
  return {
    win: other,
    doc,
    mount: host.mountPoint,
    viewport,
    close() {
      stopWatching()
      host.destroy()
      other.close()
    },
  }
}
