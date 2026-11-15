// src/dom/boxmodel.ts
// Live box model and type readout of one element, for measuring. Never stored or exported.

import { windowOf } from './window'

export interface Sides {
  top: number
  right: number
  bottom: number
  left: number
}

export interface BoxModel {
  margin: Sides
  border: Sides
  padding: Sides
}

export interface Readout {
  x: number
  y: number
  width: number
  height: number
  box: BoxModel
  font: { family: string, size: string, weight: string, lineHeight: string }
  color: string
  background: string
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const

/** One box edge's four sides, e.g. `margin` or `border` with `-width`; anything unreadable is 0. */
export function sidesOf(style: CSSStyleDeclaration, prefix: string, suffix = ''): Sides {
  const out = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const side of SIDES) {
    const width = Number.parseFloat(style.getPropertyValue(`${prefix}-${side}${suffix}`))
    out[side] = Number.isFinite(width) ? width : 0
  }
  return out
}

function styleOf(element: Element): CSSStyleDeclaration {
  return windowOf(element.ownerDocument).getComputedStyle(element)
}

export function boxModel(element: Element): BoxModel {
  const style = styleOf(element)
  return {
    margin: sidesOf(style, 'margin'),
    border: sidesOf(style, 'border', '-width'),
    padding: sidesOf(style, 'padding'),
  }
}

export function readout(element: Element): Readout {
  const style = styleOf(element)
  const rect = element.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    box: boxModel(element),
    font: {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      lineHeight: style.lineHeight,
    },
    color: style.color,
    background: style.backgroundColor,
  }
}

/**
 * True when inner sits inside outer in the composed tree (through open shadow roots);
 * an element does not contain itself.
 */
export function composedContains(outer: Element, inner: Element): boolean {
  let node: Node | null = inner
  while (node) {
    const next: Node | null = node.parentNode ?? null
    node = next?.nodeType === 11 && (next as ShadowRoot).host ? (next as ShadowRoot).host : next
    if (node === outer) return true
  }
  return false
}
