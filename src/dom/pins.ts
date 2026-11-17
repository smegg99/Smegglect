// src/dom/pins.ts
// Where each issue's target is now. Live handles first; descriptors only when a handle is gone.

import { shift, union } from '../core/geometry'
import type { ElementDescriptor, Issue, Rect, TargetRef } from '../core/model'
import { cleanLocation } from '../core/redact'
import { rectOf, rendered, screenName } from './capture'
import { elementsOf, type Operand } from './issue'
import { resolveAgain } from './resolve'

/** `hidden`: the target is on the page without a box (under display: none, as a view kept behind v-show). */
export type PinStatus = 'live' | 'ambiguous' | 'unavailable' | 'elsewhere' | 'hidden'

export interface Pin {
  id: string
  seq: number
  rect: Rect | null
  /** Live reference B, when the issue has one and it is on this page. */
  b: Rect | null
  status: PinStatus
}

/** A descriptor is matched only on the page and screen it was captured on. */
export function elsewhere(issue: Issue, location: string, screen?: string): boolean {
  return issue.evidence.capture.location !== location
    || (issue.evidence.capture.screen ?? '') !== screenName(screen)
}

/** The window's page and screen as one key: two views of one URL differ only in the host's screen name. */
export function pageKey(win: Window, screen?: string): string {
  return `${cleanLocation(win.location.href)} ${screenName(screen)}`
}

interface Cached {
  location: string
  status: PinStatus
  elements: Element[]
  /** The page's element count when the target was looked for: a miss holds only until the page changes. */
  nodes: number
}

/** Where each draft issue's target is now, through a live handle while there is one. */
export interface Pins {
  remember: (id: string, a: Operand, b?: Operand) => void
  forgetMissing: (issues: readonly Issue[]) => void
  /** `screen` is the host's route name when it provides one; hash routes are invisible to `location`. */
  sample: (issues: readonly Issue[], win: Window, screen?: string) => Pin[]
  /** The elements the plates stand on now, so a change of their box (hidden with a view) redraws them. */
  targets: () => Element[]
}

/** What the pin functions share: the page, and what is held per issue id. */
interface PinState {
  doc: Document
  attrs: readonly string[]
  /** Live handles to each issue's target A, from when it was reported. */
  handles: Map<string, WeakRef<Element>[]>
  /** Live handle to each issue's reference B. */
  refs: Map<string, WeakRef<Element>>
  /**
   * Reference B found again by its descriptor, and the location it was looked for on. Held strongly, so
   * dropped once its issue is elsewhere: a view the host left must not stay alive for it.
   */
  bCache: Map<string, { location: string, element: Element | null, nodes: number }>
  /** Target A found again by its descriptors, per issue; dropped like `bCache`. */
  cache: Map<string, Cached>
  /** Every element of the page, live: its length changes when a view renders or drops content. */
  all: HTMLCollection
}

type Lookup = Pick<Cached, 'location' | 'nodes'>

/** A found target holds while it is on the page; a miss until the page gains or loses elements. */
function current(state: PinState, location: string, hit: Lookup, found: Element[]) {
  if (hit.location !== location) return false
  return found.length ? found.every(element => element.isConnected) : hit.nodes === state.all.length
}

/** One sampling pass: the window, the page's location now, and the host's screen name. */
interface Sampling {
  win: Window
  location: string
  screen?: string
}

function descriptorsOf(ref: TargetRef): ElementDescriptor[] {
  if (ref.kind === 'dom') return [ref.element]
  if (ref.kind === 'group') return ref.members
  return ref.anchor ? [ref.anchor.element] : []
}

function live(state: PinState, id: string): Element[] | null {
  const held = state.handles.get(id)
  if (!held) return null
  const elements = held.map(ref => ref.deref())
  return elements.every(element => element && element.isConnected) ? elements as Element[] : null
}

function locate(state: PinState, issue: Issue, location: string): Cached {
  const hit = state.cache.get(issue.id)
  if (hit && current(state, location, hit, hit.elements)) return hit
  const found: Element[] = []
  let status: PinStatus = 'live'
  for (const descriptor of descriptorsOf(issue.operands.a)) {
    const resolved = resolveAgain(state.doc, descriptor, state.attrs)
    if (resolved.status === 'resolved') found.push(resolved.element)
    else if (resolved.status === 'unavailable' || status === 'unavailable') status = 'unavailable'
    else status = 'ambiguous'
  }
  const next: Cached = { location, status, elements: status === 'live' ? found : [], nodes: state.all.length }
  state.cache.set(issue.id, next)
  return next
}

/** What a target is held by: its elements, or for a region the element it was drawn on. */
function heldBy(a: Operand): Element[] {
  if (a.kind !== 'region') return elementsOf(a)
  return a.anchor ? [a.anchor.handle] : []
}

function remember(state: PinState, id: string, a: Operand, b?: Operand): void {
  const elements = heldBy(a)
  if (elements.length) state.handles.set(id, elements.map(element => new WeakRef(element)))
  if (b?.kind === 'dom') state.refs.set(id, new WeakRef(b.element))
}

function forgetMissing(state: PinState, issues: readonly Issue[]): void {
  const keep = new Set(issues.map(issue => issue.id))
  for (const id of [...state.handles.keys()]) if (!keep.has(id)) state.handles.delete(id)
  for (const id of [...state.refs.keys()]) if (!keep.has(id)) state.refs.delete(id)
  for (const id of [...state.bCache.keys()]) if (!keep.has(id)) state.bCache.delete(id)
  for (const id of [...state.cache.keys()]) if (!keep.has(id)) state.cache.delete(id)
}

/** Where an issue's reference B is now: its live handle, else found again on the page it was reported on. */
function referenceRect(state: PinState, issue: Issue, sampling: Sampling): Rect | null {
  const held = state.refs.get(issue.id)?.deref()
  if (held?.isConnected) return rendered(held) ? rectOf(held) : null
  const b = issue.operands.b
  if (b?.kind !== 'dom') return null
  if (elsewhere(issue, sampling.location, sampling.screen)) {
    state.bCache.delete(issue.id)
    return null
  }
  const hit = state.bCache.get(issue.id)
  if (hit && current(state, sampling.location, hit, hit.element ? [hit.element] : [])) {
    return hit.element && rendered(hit.element) ? rectOf(hit.element) : null
  }
  const resolved = resolveAgain(state.doc, b.element, state.attrs)
  const element = resolved.status === 'resolved' ? resolved.element : null
  state.bCache.set(issue.id, { location: sampling.location, element, nodes: state.all.length })
  return element && rendered(element) ? rectOf(element) : null
}

type PinBase = Omit<Pin, 'rect' | 'status'>

/** A plate over targets that all have a box. */
const shown = (base: PinBase, elements: Element[]): Pin => {
  return { ...base, rect: union(elements.map(rectOf)), status: 'live' }
}

/** No plate while any target has no box. */
const hidden = (base: PinBase): Pin => ({ ...base, rect: null, status: 'hidden' })

/** Not on this page: what was found on the last one is let go, so a view the host left can be collected. */
function away(state: PinState, base: PinBase): Pin {
  state.cache.delete(base.id)
  state.bCache.delete(base.id)
  return { ...base, rect: null, status: 'elsewhere' }
}

/**
 * A region on the element it was drawn on, through its live handle or found again by its descriptor; where
 * it was drawn in the document while that element is not found, and nowhere while it has no box.
 */
function regionPin(state: PinState, issue: Issue, sampling: Sampling, base: PinBase): Pin {
  const { win, location, screen } = sampling
  const a = issue.operands.a
  if (a.kind !== 'region') return away(state, base)
  if (elsewhere(issue, location, screen)) return away(state, base)
  const size = { width: a.rect.width, height: a.rect.height }
  const anchored = (element: Element): Pin => {
    if (!rendered(element) || !a.anchor) return hidden(base)
    const box = rectOf(element)
    const rect = { x: box.x + a.anchor.offset.x, y: box.y + a.anchor.offset.y, ...size }
    return { ...base, rect, status: 'live' }
  }
  if (a.anchor) {
    const held = live(state, issue.id)?.[0]
    if (held) return anchored(held)
    const found = locate(state, issue, location).elements[0]
    if (found) return anchored(found)
  }
  const cap = issue.evidence.capture
  const rect = a.frame === 'document'
    ? shift(a.rect, -win.scrollX, -win.scrollY)
    : shift(a.rect, cap.scroll.x - win.scrollX, cap.scroll.y - win.scrollY)
  return { ...base, rect, status: 'live' }
}

function pinOf(state: PinState, issue: Issue, sampling: Sampling): Pin {
  const { location, screen } = sampling
  const b = issue.operands.b ? referenceRect(state, issue, sampling) : null
  const base = { id: issue.id, seq: issue.seq, b }
  const a = issue.operands.a
  if (a.kind === 'region') return regionPin(state, issue, sampling, base)
  const held = live(state, issue.id)
  if (held?.every(rendered)) return shown(base, held)
  if (elsewhere(issue, location, screen)) return away(state, base)
  // Each box is read once per sample: a held target here is one without a box.
  if (held) return hidden(base)
  const found = locate(state, issue, location)
  if (!found.elements.length) {
    return { ...base, rect: null, status: found.status === 'live' ? 'unavailable' : found.status }
  }
  return found.elements.every(rendered) ? shown(base, found.elements) : hidden(base)
}

function targets(state: PinState): Element[] {
  const out = new Set<Element>()
  for (const refs of state.handles.values()) {
    for (const ref of refs) {
      const element = ref.deref()
      if (element?.isConnected) out.add(element)
    }
  }
  for (const hit of state.cache.values()) {
    for (const element of hit.elements) if (element.isConnected) out.add(element)
  }
  return [...out]
}

export function createPins(doc: Document, attrs: readonly string[]): Pins {
  const state: PinState = {
    doc,
    attrs,
    handles: new Map(),
    refs: new Map(),
    bCache: new Map(),
    cache: new Map(),
    all: doc.getElementsByTagName('*'),
  }
  return {
    remember: (id, a, b) => remember(state, id, a, b),
    forgetMissing: issues => forgetMissing(state, issues),
    sample(issues, win, screen) {
      const sampling: Sampling = { win, location: cleanLocation(win.location.href), screen }
      return issues.map(issue => pinOf(state, issue, sampling))
    },
    targets: () => targets(state),
  }
}
