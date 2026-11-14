// src/overlay/readout.ts
// Short forms of live measurements, so each fits one row: CSS shorthands, hex colours, one typeface.

import { px } from '../core/geometry'
import type { Sides } from '../dom/boxmodel'

/** The shortest CSS shorthand for four sides, values rounded as labels are. */
export function shorthand(s: Sides): string {
  const [t, r, b, l] = [s.top, s.right, s.bottom, s.left].map(px)
  if (t === r && r === b && b === l) return t!
  if (t === b && r === l) return `${t} ${r}`
  if (r === l) return `${t} ${r} ${b}`
  return `${t} ${r} ${b} ${l}`
}

const RGB = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/

/** `rgb()` and `rgba()` as hex; fully transparent as `transparent`; anything else unchanged. */
export function hex(css: string): string {
  const m = RGB.exec(css.trim())
  if (!m) return css
  const alpha = m[4] === undefined ? 1 : Number(m[4])
  if (alpha === 0) return 'transparent'
  const part = (n: number) => n.toString(16).padStart(2, '0')
  const base = `#${part(Number(m[1]))}${part(Number(m[2]))}${part(Number(m[3]))}`
  return alpha < 1 ? `${base}${part(Math.round(alpha * 255))}` : base
}

/** The first family of a font-family list, without quotes. */
export function family(list: string): string {
  return (list.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}
