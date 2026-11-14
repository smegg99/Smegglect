// src/dom/resolve.ts
// Descriptor -> live element, conservatively. Two plausible matches are ambiguous, never "the first".

import type { ElementDescriptor } from '../core/model'
import { describe, DEFAULT_TEST_ATTRIBUTES } from './describe'

export type Resolution =
  | { status: 'resolved', element: Element }
  | { status: 'ambiguous', count: number }
  | { status: 'unavailable' }

/** Upper bound on elements examined per resolution; resolution never runs on the pointer path. */
const SCAN_LIMIT = 5000

function escapeAttr(v: string): string {
  return v.replace(/["\\]/g, '\\$&')
}

function candidates(root: Document, d: ElementDescriptor, attrs: readonly string[]): Element[] {
  if (d.id) {
    const el = root.getElementById(d.id)
    return el && el.localName === d.tag ? [el] : []
  }
  if (d.testId) {
    const sel = attrs.map(a => `${d.tag}[${a}="${escapeAttr(d.testId as string)}"]`).join(',')
    return [...root.querySelectorAll(sel)]
  }
  return [...root.getElementsByTagName(d.tag)].slice(0, SCAN_LIMIT)
}

function matches(found: ElementDescriptor, want: ElementDescriptor, anyLabel: boolean): boolean {
  if (found.tag !== want.tag || found.role !== want.role || (!anyLabel && found.label !== want.label)) return false
  if (found.shadowDepth !== want.shadowDepth) return false
  if (!want.classes.every(c => found.classes.includes(c))) return false
  return found.path.join('>') === want.path.join('>')
}

/** `anyLabel` ignores the captured text, e.g. to find a target again after a fix changed its text. */
export function resolve(root: Document, want: ElementDescriptor, attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES, anyLabel = false): Resolution {
  if (want.shadowDepth > 0) {
    // Open shadow content is not reachable through document queries; live handles cover it within a page.
    return { status: 'unavailable' }
  }
  const pool = candidates(root, want, attrs).filter(el => matches(describe(el, attrs), want, anyLabel))
  if (pool.length === 0) return { status: 'unavailable' }
  if (pool.length === 1 && !want.occurrence) return { status: 'resolved', element: pool[0] as Element }
  const occ = want.occurrence
  if (occ) {
    const found = pool.map(el => ({ el, o: describe(el, attrs).occurrence }))
    // The item's own text follows a reordered row; the index alone would follow the slot.
    const sameItem = occ.item ? found.filter(f => f.o?.item === occ.item) : found
    if (occ.item && sameItem.length === 0) return { status: 'unavailable' }
    if (occ.item && sameItem.length === 1) return { status: 'resolved', element: (sameItem[0] as { el: Element }).el }
    const slot = sameItem.filter(f => f.o?.index === occ.index && f.o?.count === occ.count)
    if (slot.length === 1 && sameItem.length === 1) return { status: 'resolved', element: (slot[0] as { el: Element }).el }
    if (!occ.item && slot.length === 1) return { status: 'resolved', element: (slot[0] as { el: Element }).el }
    return { status: 'ambiguous', count: sameItem.length }
  }
  return { status: 'ambiguous', count: pool.length }
}

/** Exact first; when nothing matches and the descriptor has text, once more without it. Still one match or none. */
export function resolveAgain(root: Document, want: ElementDescriptor, attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES): Resolution & { withoutLabel?: true } {
  const exact = resolve(root, want, attrs)
  if (exact.status !== 'unavailable' || !want.label) return exact
  const loose = resolve(root, want, attrs, true)
  return loose.status === 'resolved' ? { ...loose, withoutLabel: true } : exact
}
