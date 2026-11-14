// src/dom/boxmodel.ts
// Live box model and type readout of one element, for measuring. Never stored or exported.

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

function sides(style: CSSStyleDeclaration, prefix: string, suffix = ''): Sides {
  const out = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const side of SIDES) {
    const v = Number.parseFloat(style.getPropertyValue(`${prefix}-${side}${suffix}`))
    out[side] = Number.isFinite(v) ? v : 0
  }
  return out
}

function styleOf(el: Element): CSSStyleDeclaration {
  return el.ownerDocument.defaultView!.getComputedStyle(el)
}

export function boxModel(el: Element): BoxModel {
  const style = styleOf(el)
  return { margin: sides(style, 'margin'), border: sides(style, 'border', '-width'), padding: sides(style, 'padding') }
}

export function readout(el: Element): Readout {
  const style = styleOf(el)
  const r = el.getBoundingClientRect()
  return {
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    box: boxModel(el),
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

/** True when inner sits inside outer in the composed tree (through open shadow roots); an element does not contain itself. */
export function composedContains(outer: Element, inner: Element): boolean {
  let node: Node | null = inner
  while (node) {
    const next: Node | null = node.parentNode ?? null
    node = next?.nodeType === 11 && (next as ShadowRoot).host ? (next as ShadowRoot).host : next
    if (node === outer) return true
  }
  return false
}
