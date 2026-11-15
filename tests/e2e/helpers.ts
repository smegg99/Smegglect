// tests/e2e/helpers.ts
import { expect, type Page } from '@playwright/test'

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
  await reach(page, selector)
  await page.locator(selector).first().click(opts.shift ? { modifiers: ['Shift'] } : {})
}

/** The draft issues as the engine holds them. */
export function draftIssues(page: Page) {
  return page.evaluate(() => window.sg!.engine.state().drafts.issues)
}

/** A switch in the Settings tab, by its row's label. */
export function settingSwitch(page: Page, label: string) {
  return ui(page, '.inspector .settings .form-row').filter({ hasText: label }).locator('input')
}

/** An action from the toolbar's More menu, by its name. */
export async function moreItem(page: Page, name: string) {
  await ui(page, '.dock [aria-label="More"]').click()
  await ui(page, '.pop [role="menuitem"]').filter({ hasText: name }).click()
}

/** The drawer keeps its size, so a target under it is reached by moving the toolbar away, as a person would. */
export async function reach(page: Page, selector: string) {
  const target = await page.locator(selector).first().boundingBox()
  const panel = ui(page, '.inspector')
  if (!target || !(await panel.count())) return
  const p = (await panel.boundingBox())!
  const x = target.x + target.width / 2
  const y = target.y + target.height / 2
  if (!(x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)) return
  // The drawer opens beside the toolbar: on the edge away from the target it leaves the target free.
  const away = x < (page.viewportSize()?.width ?? 0) / 2 ? 'right' as const : 'left' as const
  await page.evaluate(placement => window.sg!.update({ placement }), away)
  await expect.poll(async () => {
    const moved = (await panel.boundingBox())!
    return x < moved.x || x > moved.x + moved.width
  }).toBe(true)
}

/** A click on the page while Smegglect waits for one (B, an anchor), past the panel when it is in the way. */
export async function tap(page: Page, selector: string) {
  await reach(page, selector)
  await page.locator(selector).first().click()
}

/** A row in the tree of issue types by preset id (Favourites mark theirs differently). */
export function tile(page: Page, id: string) {
  return ui(page, `.inspector [data-tree="actions"] [data-preset="${id}"]`)
}

/** Opens folded groups until the type shows; returns its row. */
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
 * Adds an issue of one type (`size`, `match-height`, ...): picks its row in the type tree (Note is picked already),
 * with `b` picks the reference, writes `note` and, unless `keepOpen`, presses Add.
 */
export async function preset(page: Page, id: string, opts: { b?: string, note?: string, keepOpen?: boolean } = {}) {
  if (id !== 'note') await (await action(page, id)).click()
  if (opts.b) await tap(page, opts.b)
  if (opts.note) await ui(page, '.inspector .compose textarea').fill(opts.note)
  if (!opts.keepOpen) await ui(page, '.inspector .compose .add').click()
}

/** The send area at the foot of the Issues tab: every button one height, everything 8 px apart. */
export async function footRhythm(page: Page): Promise<{ heights: number[], gaps: number[] }> {
  return page.evaluate(() => {
    const foot = document.querySelector('smegglect-root')!.shadowRoot!.querySelector('.inspector > .foot')!
    const shown = (el: Element) => (el as HTMLElement).offsetParent !== null
    const heights = [...foot.querySelectorAll('button')].filter(shown).map(b => Math.round(b.getBoundingClientRect().height))
    // Vertical gaps between the rows of the foot, and between the rows and columns of its buttons.
    const rows = [...foot.querySelectorAll(':scope > *, :scope > .actions > *')].filter(shown).map(el => el.getBoundingClientRect())
    const gaps: number[] = []
    for (const a of rows) for (const b of rows) {
      if (b.top > a.bottom - 0.5 && b.left < a.right && a.left < b.right) gaps.push(Math.round(b.top - a.bottom))
      if (b.left > a.right - 0.5 && Math.abs(b.top - a.top) < 1) gaps.push(Math.round(b.left - a.right))
    }
    // Only neighbours count: the gap to the next row or column, not to ones further away.
    return { heights, gaps: gaps.filter(g => g >= 0 && g < 24) }
  })
}
