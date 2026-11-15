// src/dom/resolve.ts
// Descriptor -> live element, conservatively. Two plausible matches are ambiguous, never "the first".

import type { ElementDescriptor } from '../core/model'
import { cleanClasses } from '../core/redact'
import { DEFAULT_TEST_ATTRIBUTES, labelOf, occurrenceOf, pathOf, roleOf } from './describe'

export type Resolution =
  | { status: 'resolved', element: Element }
  | { status: 'ambiguous', count: number }
  | { status: 'unavailable' }

type Occurrence = NonNullable<ElementDescriptor['occurrence']>

/**
 * Most elements one resolution examines. Pins look a target up again inside a frame's sample whenever
 * the page gains or loses elements, so a page with thousands of one tag must not stall it.
 */
const SCAN_LIMIT = 5000

/** The elements a lookup examines; `capped` when more were there than SCAN_LIMIT. */
interface Scan {
  elements: Element[]
  capped: boolean
}

/** The first SCAN_LIMIT elements of a query, read one by one rather than all at once. */
function scanOf(found: { item: (index: number) => Element | null }): Scan {
  const elements: Element[] = []
  for (let i = 0; i < SCAN_LIMIT; i++) {
    const element = found.item(i)
    if (!element) return { elements, capped: false }
    elements.push(element)
  }
  return { elements, capped: found.item(SCAN_LIMIT) !== null }
}

/** Elements of one tag whose test attribute has this value; names and value escaped, as any may be odd. */
function testSelector(tag: string, attrs: readonly string[], value: string): string {
  return attrs.map(attr => `${CSS.escape(tag)}[${CSS.escape(attr)}="${CSS.escape(value)}"]`).join(',')
}

/** Elements that could be `tag`, by id, by test id, or by the tag alone. */
function scanFor(root: Document, tag: string, attrs: readonly string[], id?: string, testId?: string): Scan {
  if (id) {
    const element = root.getElementById(id)
    return { elements: element && element.localName === tag ? [element] : [], capped: false }
  }
  if (testId) return scanOf(root.querySelectorAll(testSelector(tag, attrs, testId)))
  return scanOf(root.getElementsByTagName(tag))
}

/** The cheap checks first; the path walks ancestors and the label reads text, so they come last. */
function matches(element: Element, want: ElementDescriptor, attrs: readonly string[], anyLabel: boolean) {
  if (element.localName !== want.tag || roleOf(element) !== want.role) return false
  const classes = cleanClasses(element.classList)
  if (!want.classes.every(name => classes.includes(name))) return false
  if (pathOf(element, attrs).join('>') !== want.path.join('>')) return false
  return anyLabel || (labelOf(element) || undefined) === want.label
}

/** Several matches told apart by the place in a repeated list the descriptor was captured at. */
function byOccurrence(pool: Element[], occ: Occurrence): Resolution {
  const found = pool.map(element => ({ element, place: occurrenceOf(element) }))
  // The item's own text follows a reordered row; the index alone would follow the slot.
  const sameItem = occ.item ? found.filter(entry => entry.place?.item === occ.item) : found
  const [first] = sameItem
  if (occ.item && !first) return { status: 'unavailable' }
  if (occ.item && first && sameItem.length === 1) return { status: 'resolved', element: first.element }
  const slot = sameItem.filter(entry => entry.place?.index === occ.index && entry.place?.count === occ.count)
  const [only] = slot
  if (!occ.item && only && slot.length === 1) return { status: 'resolved', element: only.element }
  return { status: 'ambiguous', count: sameItem.length }
}

function choose(pool: Element[], occ: Occurrence | undefined): Resolution {
  if (occ) return byOccurrence(pool, occ)
  const [only] = pool
  if (only && pool.length === 1) return { status: 'resolved', element: only }
  return { status: 'ambiguous', count: pool.length }
}

/** `anyLabel` ignores the captured text, e.g. to find a target again after a fix changed its text. */
export function resolve(
  root: Document,
  want: ElementDescriptor,
  attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES,
  anyLabel = false,
): Resolution {
  if (want.shadowDepth > 0) {
    // Open shadow content is not reachable through document queries; live handles cover it within a page.
    return { status: 'unavailable' }
  }
  const scan = scanFor(root, want.tag, attrs, want.id, want.testId)
  const pool = scan.elements.filter(element => matches(element, want, attrs, anyLabel))
  if (pool.length === 0) return { status: 'unavailable' }
  const chosen = choose(pool, want.occurrence)
  // A scan stopped at its limit cannot prove that no second match lies past it.
  if (chosen.status === 'resolved' && scan.capped) return { status: 'ambiguous', count: pool.length }
  return chosen
}

/**
 * Exact first; when nothing matches and the descriptor has text, once more without it.
 * Still one match or none.
 */
export function resolveAgain(
  root: Document,
  want: ElementDescriptor,
  attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES,
): Resolution & { withoutLabel?: true } {
  const exact = resolve(root, want, attrs)
  if (exact.status !== 'unavailable' || !want.label) return exact
  const loose = resolve(root, want, attrs, true)
  return loose.status === 'resolved' ? { ...loose, withoutLabel: true } : exact
}

/** Elements that could be the target by tag, id or test id alone, before its place and text are compared. */
export function candidateCount(
  root: Document,
  want: ElementDescriptor,
  attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES,
): number {
  return scanFor(root, want.tag, attrs, want.id, want.testId).elements.length
}

/** One step of a descriptor's ancestor chain: `tag`, `tag#id` or `tag[test=value]`. */
const STEP = /^([a-z][\w-]*)(?:#(.+)|\[test=(.+)\])?$/

const endsWith = (chain: readonly string[], tail: readonly string[]) =>
  tail.length <= chain.length && tail.every((step, i) => chain[chain.length - tail.length + i] === step)

/** The nearest ancestor on the target's old chain that still resolves to exactly one element. */
export function nearestAncestor(
  root: Document,
  want: ElementDescriptor,
  attrs: readonly string[] = DEFAULT_TEST_ATTRIBUTES,
): { element: Element, step: string, levelsUp: number } | null {
  for (let level = want.path.length - 1; level >= 0; level--) {
    const step = want.path[level] ?? ''
    const parts = STEP.exec(step)
    if (!parts) continue
    const [, tag = '', id, test] = parts
    const above = want.path.slice(0, level)
    const scan = scanFor(root, tag, attrs, id, test)
    const found = scan.elements.filter(element => endsWith(pathOf(element, attrs), above))
    const [only] = found
    const levelsUp = want.path.length - level
    if (only && found.length === 1 && !scan.capped) return { element: only, step, levelsUp }
  }
  return null
}
