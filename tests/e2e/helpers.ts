// tests/e2e/helpers.ts
import type { Page } from '@playwright/test'

/** Counts listeners, frames, observers and object URLs owned by window, document and visualViewport. */
export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const live = new Map<string, number>()
    const bump = (k: string, d: number) => live.set(k, (live.get(k) ?? 0) + d)
    const tracked = (t: EventTarget) => t === window || t === document || t === window.visualViewport
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    const keys = new Set<string>()
    const keyOf = (t: EventTarget, type: string, fn: unknown, opts: unknown) => {
      const capture = typeof opts === 'boolean' ? opts : !!(opts as { capture?: boolean } | undefined)?.capture
      return `${t === window ? 'w' : t === document ? 'd' : 'v'}:${type}:${capture}:${String((fn as { name?: string })?.name)}:${(window as unknown as { __fnId: (f: unknown) => number }).__fnId(fn)}`
    }
    const ids = new WeakMap<object, number>()
    let next = 1
    ;(window as unknown as { __fnId: (f: unknown) => number }).__fnId = (f: unknown) => {
      if (!f || typeof f !== 'object' && typeof f !== 'function') return 0
      if (!ids.has(f as object)) ids.set(f as object, next++)
      return ids.get(f as object)!
    }
    EventTarget.prototype.addEventListener = function (type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
      if (tracked(this) && fn) {
        const k = keyOf(this, type, fn, opts)
        if (!keys.has(k)) {
          keys.add(k)
          bump('listeners', 1)
        }
      }
      return add.call(this, type, fn, opts)
    }
    EventTarget.prototype.removeEventListener = function (type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | EventListenerOptions) {
      if (tracked(this) && fn) {
        const k = keyOf(this, type, fn, opts)
        if (keys.delete(k)) bump('listeners', -1)
      }
      return remove.call(this, type, fn, opts)
    }
    const raf = window.requestAnimationFrame.bind(window)
    const caf = window.cancelAnimationFrame.bind(window)
    const pending = new Set<number>()
    window.requestAnimationFrame = (cb) => {
      const id = raf((t) => {
        pending.delete(id)
        cb(t)
      })
      pending.add(id)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      pending.delete(id)
      caf(id)
    }
    const RO = window.ResizeObserver
    let observers = 0
    window.ResizeObserver = class extends RO {
      constructor(cb: ResizeObserverCallback) {
        super(cb)
        observers++
      }

      override disconnect() {
        observers--
        super.disconnect()
      }
    }
    const urls = new Set<string>()
    const create = URL.createObjectURL
    const revoke = URL.revokeObjectURL
    URL.createObjectURL = (b: Blob | MediaSource) => {
      const u = create(b)
      urls.add(u)
      return u
    }
    URL.revokeObjectURL = (u: string) => {
      urls.delete(u)
      revoke(u)
    }
    ;(window as unknown as { owned: () => Record<string, number> }).owned = () => ({
      listeners: live.get('listeners') ?? 0,
      frames: pending.size,
      observers,
      urls: urls.size,
    })
  })
}

export async function owned(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => (window as unknown as { owned: () => Record<string, number> }).owned())
}

export const root = 'smegglect-root'

export function ui(page: Page, selector: string) {
  return page.locator(`${root} ${selector}`)
}

export async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { events: string[] }).events.splice(0))
}

/** Waits for one animation frame plus Vue's flush. */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
}

/** Turns pick mode on (if needed) and clicks a host element. */
export async function pick(page: Page, selector: string, opts: { shift?: boolean } = {}) {
  const key = ui(page, '.dock [aria-label="Pick element"]')
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await page.locator(selector).first().click(opts.shift ? { modifiers: ['Shift'] } : {})
}

/** An action row in the inspector's tree by preset id (Favourites mark theirs differently). */
export function tile(page: Page, id: string) {
  return ui(page, `.inspector [data-tree="actions"] [data-preset="${id}"]`)
}

/** Opens folded groups until the action shows (some groups start closed), then returns it. */
export async function action(page: Page, id: string) {
  const row = tile(page, id)
  for (let guard = 0; guard < 12 && !(await row.isVisible()); guard++) {
    const closed = ui(page, '.inspector [data-tree="actions"] [role="treeitem"][aria-expanded="false"]').first()
    if (!(await closed.count())) break
    await closed.click()
  }
  return row
}

/**
 * Starts a preset from its inspector tile (`size`, `match-height`, ...).
 * With `b`, picks the reference; then fills the issue form and, unless `keepOpen`, adds the issue.
 */
export async function preset(page: Page, id: string, opts: { b?: string, choice?: string, note?: string, keepOpen?: boolean } = {}) {
  await (await action(page, id)).click()
  if (opts.b) await page.locator(opts.b).first().click()
  await ui(page, '.inspector .form').waitFor()
  if (opts.choice) await ui(page, '.inspector .form .chipkey').filter({ hasText: opts.choice }).click()
  if (opts.note) await ui(page, '.inspector .form textarea').first().fill(opts.note)
  if (!opts.keepOpen) await ui(page, '.inspector .form .key.primary').click()
}
