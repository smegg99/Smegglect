// src/overlay/vuetify/shadow-css.ts
// Vuetify's and S99AB's stylesheets are written for a document; the overlay lives in a shadow root. Before
// they are injected, the document root becomes the shadow host and rem becomes px, so the host page's root
// font size never scales the overlay.

/** The root font size Vuetify and S99AB assume; rem values become this many px each. */
const ROOT_PX = 16

/** `:root` with what follows it in the same compound: attributes, `:not(...)` and the like. */
const ROOT_COMPOUND = /:root((?:\[[^\]]*\]|:not\((?:[^()]|\([^()]*\))*\))+)/g

/** A number with a rem unit, not part of a longer word. */
const REM = /(-?\d*\.?\d+)rem\b/g

/** Rounded to a hundredth of a px, without trailing zeros. */
const pxOf = (rem: string) => `${Math.round(Number(rem) * ROOT_PX * 100) / 100}px`

/**
 * One `@layer` statement: names, then `;` or a block of further layer statements and nothing else, minified
 * or not (Vuetify's per-component sheets are not), with the space after it.
 */
const LAYER_STATEMENT
  = /^@layer\s+[\w-]+(?:\s*,\s*[\w-]+)*\s*(?:;|\{\s*(?:@layer\s+[\w-]+(?:\s*,\s*[\w-]+)*\s*;?\s*)*\})\s*/

/**
 * Vuetify's cascade layer order: the layer statements its stylesheet opens with, before any rule. Layers rank
 * by where they are first named, and in a shadow root a style element comes before the adopted sheets, so the
 * theme stylesheet must name them in this order first.
 */
export function layerOrder(css: string): string {
  let rest = css.replace(/^\s*\/\*[\s\S]*?\*\//, '').trimStart()
  let order = ''
  for (let match = LAYER_STATEMENT.exec(rest); match; match = LAYER_STATEMENT.exec(rest)) {
    order += match[0]
    rest = rest.slice(match[0].length)
  }
  return order
}

export function forShadow(css: string): string {
  return css
    .replace(ROOT_COMPOUND, (_whole, compound: string) => `:host(${compound})`)
    .replace(/:root\b/g, ':host')
    .replace(REM, (_whole, value: string) => pxOf(value))
}
