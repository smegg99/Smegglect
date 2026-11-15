// src/dom/keys.ts
// Escape ownership and Alt+Shift shortcuts. Typing and IME composition are never interpreted.

import type { Scope } from './scope'
import type { HostWindow } from './window'

export type ShortcutAction = 'toggle' | 'pick' | 'region' | 'measure' | 'undo' | 'redo'

/** Physical keys, so the shortcut does not move with the keyboard layout. */
const SHORTCUTS: Record<string, ShortcutAction> = {
  KeyS: 'toggle',
  KeyP: 'pick',
  KeyR: 'region',
  KeyM: 'measure',
  KeyZ: 'undo',
  KeyY: 'redo',
}

export interface KeyHooks {
  owns: (event: Event) => boolean
  /** Returns true when Smegglect cancelled something; focusInHost is true when a host element has focus. */
  escape: (focusInHost: boolean) => boolean
  shortcut: (action: ShortcutAction) => void
  /** Whether the Alt+Shift shortcuts are on now; Escape is handled either way. */
  shortcuts: () => boolean
}

/** The keyCode of a key an input method is composing; some engines send it without `isComposing`. */
const IME_KEY_CODE = 229

function editable(element: Element | null): boolean {
  if (!element) return false
  const tag = element.localName
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') return ![
    'button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file',
  ].includes((element as HTMLInputElement).type)
  return (element as HTMLElement).isContentEditable === true
}

export function createKeys(win: HostWindow, parent: Scope, hooks: KeyHooks) {
  const scope = parent.child()
  scope.listen<KeyboardEvent>(win, 'keydown', (event) => {
    if (event.isComposing || event.keyCode === IME_KEY_CODE) return
    const target = event.composedPath()[0] as Element | null
    if (event.key === 'Escape') {
      const active = win.document.activeElement
      const focusInHost = !hooks.owns(event)
        && !!active
        && active !== win.document.body
        && active !== win.document.documentElement
      if (hooks.escape(focusInHost)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      return
    }
    if (!hooks.shortcuts() || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
    const action = SHORTCUTS[event.code]
    if (!action || editable(target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    hooks.shortcut(action)
  }, { capture: true })
  return { stop: () => scope.dispose() }
}
