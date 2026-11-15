// src/overlay/readout.ts
// Short forms of live measurements, so each fits one row: CSS shorthands, hex colours, one typeface.

import { px } from '../core/geometry'
import type { Sides } from '../dom/boxmodel'

/** The shortest CSS shorthand for four sides, values rounded as labels are. */
export function shorthand(sides: Sides): string {
  const top = px(sides.top)
  const right = px(sides.right)
  const bottom = px(sides.bottom)
  const left = px(sides.left)
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

const RGB = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/

/** `rgb()` and `rgba()` as hex; fully transparent as `transparent`; anything else unchanged. */
export function hex(css: string): string {
  const match = RGB.exec(css.trim())
  if (!match) return css
  const alpha = match[4] === undefined ? 1 : Number(match[4])
  if (alpha === 0) return 'transparent'
  const part = (channel: number) => channel.toString(16).padStart(2, '0')
  const base = `#${part(Number(match[1]))}${part(Number(match[2]))}${part(Number(match[3]))}`
  return alpha < 1 ? `${base}${part(Math.round(alpha * 255))}` : base
}

/** The first family of a font-family list, without quotes. */
export function family(list: string): string {
  return (list.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}
