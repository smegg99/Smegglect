// src/overlay/tip.ts
// The one themed tooltip: any element can raise it; keys, tiles and plates share it.

import type { Tip, Ui } from './runtime'

export function showTip(ui: Ui, el: Element, text: string, side: Tip['side'] = 'above', kbd?: string): void {
  ui.tip = { text, rect: el.getBoundingClientRect(), side, ...(kbd ? { kbd } : {}) }
}

export function hideTip(ui: Ui, text: string): void {
  if (ui.tip?.text === text) ui.tip = null
}
