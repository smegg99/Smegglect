// src/dom/pins.ts
// Where each issue's target is now. Live handles first; descriptors only when a handle is gone.

import { shift, union } from '../core/geometry'
import type { Issue, Rect } from '../core/model'
import { cleanLocation, cleanText } from '../core/redact'
import { rectOf } from './capture'
import type { Operand } from './issue'
import { resolveAgain } from './resolve'

export type PinStatus = 'live' | 'ambiguous' | 'unavailable' | 'elsewhere'

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
  return issue.evidence.capture.location !== location || (issue.evidence.capture.screen ?? '') !== (screen ? cleanText(screen, 80) : '')
}

interface Cached {
  location: string
  status: PinStatus
  elements: Element[]
}

export function createPins(doc: Document, attrs: readonly string[]) {
  const handles = new Map<string, WeakRef<Element>[]>()
  const refs = new Map<string, WeakRef<Element>>()
  const bCache = new Map<string, { location: string, element: Element | null }>()
  const cache = new Map<string, Cached>()

  function live(id: string): Element[] | null {
    const refs = handles.get(id)
    if (!refs) return null
    const els = refs.map(r => r.deref())
    return els.every(el => el && el.isConnected) ? els as Element[] : null
  }

  function locate(issue: Issue, location: string): Cached {
    const hit = cache.get(issue.id)
    if (hit && hit.location === location && hit.elements.every(el => el.isConnected)) return hit
    const a = issue.operands.a
    const descriptors = a.kind === 'dom' ? [a.element] : a.kind === 'group' ? a.members : []
    const found: Element[] = []
    let status: PinStatus = 'live'
    for (const d of descriptors) {
      const r = resolveAgain(doc, d, attrs)
      if (r.status === 'resolved') found.push(r.element)
      else if (r.status === 'unavailable' || status === 'unavailable') status = 'unavailable'
      else status = 'ambiguous'
    }
    const next: Cached = { location, status, elements: status === 'live' ? found : [] }
    cache.set(issue.id, next)
    return next
  }

  return {
    remember(id: string, a: Operand, b?: Operand) {
      const els = a.kind === 'dom' ? [a.element] : a.kind === 'group' ? a.elements : []
      if (els.length) handles.set(id, els.map(el => new WeakRef(el)))
      if (b?.kind === 'dom') refs.set(id, new WeakRef(b.element))
    },
    forgetMissing(issues: readonly Issue[]) {
      const keep = new Set(issues.map(i => i.id))
      for (const id of [...handles.keys()]) if (!keep.has(id)) handles.delete(id)
      for (const id of [...refs.keys()]) if (!keep.has(id)) refs.delete(id)
      for (const id of [...bCache.keys()]) if (!keep.has(id)) bCache.delete(id)
      for (const id of [...cache.keys()]) if (!keep.has(id)) cache.delete(id)
    },
    /** `screen` is the host's route name when it provides one; hash routes are invisible to `location`. */
    sample(issues: readonly Issue[], win: Window, screen?: string): Pin[] {
      const location = cleanLocation(win.location.href)
      const away = (issue: Issue) => elsewhere(issue, location, screen)
      const bOf = (issue: Issue): Rect | null => {
        const held = refs.get(issue.id)?.deref()
        if (held?.isConnected) return rectOf(held)
        const b = issue.operands.b
        if (b?.kind !== 'dom' || away(issue)) return null
        const hit = bCache.get(issue.id)
        if (hit && hit.location === location && (!hit.element || hit.element.isConnected)) return hit.element ? rectOf(hit.element) : null
        const r = resolveAgain(doc, b.element, attrs)
        const element = r.status === 'resolved' ? r.element : null
        bCache.set(issue.id, { location, element })
        return element ? rectOf(element) : null
      }
      return issues.map((issue) => {
        const base = { id: issue.id, seq: issue.seq, b: issue.operands.b ? bOf(issue) : null }
        const a = issue.operands.a
        if (a.kind === 'region') {
          const cap = issue.evidence.capture
          if (away(issue)) return { ...base, rect: null, status: 'elsewhere' as const }
          const rect = a.frame === 'document'
            ? shift(a.rect, -win.scrollX, -win.scrollY)
            : shift(a.rect, cap.scroll.x - win.scrollX, cap.scroll.y - win.scrollY)
          return { ...base, rect, status: 'live' as const }
        }
        const held = live(issue.id)
        if (held) return { ...base, rect: union(held.map(rectOf)), status: 'live' as const }
        if (away(issue)) return { ...base, rect: null, status: 'elsewhere' as const }
        const found = locate(issue, location)
        if (found.elements.length) return { ...base, rect: union(found.elements.map(rectOf)), status: 'live' as const }
        return { ...base, rect: null, status: found.status === 'live' ? 'unavailable' as const : found.status }
      })
    },
  }
}
