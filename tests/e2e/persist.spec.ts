// tests/e2e/persist.spec.ts
// Reload persistence, storage failures, frozen submissions, concurrent windows.
import { expect, test, type Page } from '@playwright/test'
import { preset, settle, tap, ui } from './helpers'

async function addClipped(page: Page, selector = '#clip') {
  const key = ui(page, '.dock [aria-label="Pick element"]')
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await tap(page, selector)
  await preset(page, 'clipped')
}

const status = (page: Page) => page.evaluate(() => window.sg!.engine.session.store.get().status.kind)

test('drafts and preferences survive a reload; the pin finds its target again', async ({ page }) => {
  await page.goto('/plain.html?open')
  await addClipped(page)
  await expect.poll(() => status(page)).toBe('saved')
  await ui(page, '.dock [aria-label="More"]').click()
  await page.locator('smegglect-root .pop .item').filter({ hasText: 'Top' }).click()
  await page.reload()
  await page.waitForFunction(() => window.sg?.engine.session.store.get().status.kind === 'saved')
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  const list = await page.evaluate(() => window.sg!.engine.state().drafts.issues)
  expect(list.map(i => i.intent.preset.id)).toEqual(['clipped'])
  await ui(page, '.dock [aria-label^="Issues"]').click()
  // Saving normally says nothing; only a problem is worth a line.
  await expect(ui(page, '.inspector .status')).toHaveCount(0)
  await settle(page)
  const mark = await ui(page, '.guides.marks rect.mark').boundingBox()
  const clip = await page.locator('#clip').boundingBox()
  expect(Math.abs(mark!.x - clip!.x)).toBeLessThan(1.5)
  expect(await ui(page, '.dock').evaluate(el => el.getBoundingClientRect().y)).toBeLessThan(40)
})

test('storage denied falls back to memory and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get: () => { throw new DOMException('denied', 'SecurityError') } })
  })
  await page.goto('/plain.html?manual')
  await page.evaluate(() => {
    const idb = (() => {
      try {
        return window.indexedDB
      }
      catch {
        return undefined
      }
    })()
    window.sg = window.smegglect.mount({ project: { id: 'denied' }, open: true, storage: idb ? 'auto' : 'memory' })
  })
  await addClipped(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .status')).toHaveText('Kept in memory only; lost on reload')
})

test('quota failure is visible and never shown as saved', async ({ page }) => {
  await page.goto('/plain.html?manual')
  await page.evaluate(() => {
    const base = window.smegglectDom.memoryStorage()
    const full = { ...base, kind: 'indexeddb' as const, durable: true, saveDraft: async () => ({ ok: false as const, error: 'quota' as const }) }
    window.sg = window.smegglect.mount({ project: { id: 'quota' }, open: true, storage: full })
  })
  await addClipped(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .status')).toHaveText('Not saved: storage is full')
  await expect(ui(page, '.inspector .status .warn')).toBeVisible()
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(1)
})

test('a corrupt stored draft is kept until the user discards it', async ({ page }) => {
  await page.goto('/plain.html?manual')
  const key = await page.evaluate(async () => {
    const win = sessionStorage.getItem('smegglect:window:corrupt') ?? 'win_corrupttest1'
    sessionStorage.setItem('smegglect:window:corrupt', win)
    const db: IDBDatabase = await new Promise((done, fail) => {
      const r = indexedDB.open('smegglect', 2)
      r.onupgradeneeded = () => {
        const d = r.result
        d.createObjectStore('drafts', { keyPath: 'key' })
        d.createObjectStore('batches', { keyPath: 'id' }).createIndex('project', 'project.id')
        d.createObjectStore('followups', { keyPath: 'id' }).createIndex('batchId', 'batchId')
        d.createObjectStore('files', { keyPath: 'id' })
        d.createObjectStore('events', { keyPath: 'id' }).createIndex('project', 'project')
      }
      r.onsuccess = () => done(r.result)
      r.onerror = () => fail(r.error)
    })
    const key = `corrupt/${win}`
    await new Promise((done) => {
      const tx = db.transaction('drafts', 'readwrite')
      tx.objectStore('drafts').put({ key, batchId: 'bat_x', revision: 4, issues: [{ id: 'not valid' }], attachments: [] })
      tx.oncomplete = done
    })
    db.close()
    return key
  })
  await page.evaluate(() => {
    window.sg = window.smegglect.mount({ project: { id: 'corrupt' }, open: true })
  })
  await page.waitForFunction(() => window.sg!.engine.session.store.get().status.kind === 'corrupt')
  await addClipped(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .status')).toContainText('Stored drafts could not be read')
  const still = await page.evaluate(async (k) => {
    const db: IDBDatabase = await new Promise(done => (indexedDB.open('smegglect').onsuccess = e => done((e.target as IDBOpenDBRequest).result)))
    const rec = await new Promise<{ revision: number }>(done => (db.transaction('drafts').objectStore('drafts').get(k).onsuccess = e => done((e.target as IDBRequest).result)))
    db.close()
    return rec.revision
  }, key)
  expect(still).toBe(4)
  await ui(page, '.inspector .status button').click()
  await expect.poll(() => status(page)).toBe('saved')
})

test('submission freezes evidence; follow-ups are separate records', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission is Chromium-only in Playwright')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/plain.html?open&memory')
  await addClipped(page)
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot button').filter({ hasText: 'Copy prompt' }).click()
  await expect(ui(page, '.toast')).toContainText('Prompt copied')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  const before = await page.evaluate(() => JSON.stringify(window.sg!.engine.session.store.get().submitted[0]))
  expect(clip).toContain(JSON.parse(before).id)
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(0)
  const id = JSON.parse(before).issues[0].id
  expect(await page.evaluate(i => window.sg!.engine.editIssue(i, { note: 'changed' }), id)).toBeUndefined()
  const added = await page.evaluate(([b, i]) => window.sg!.engine.session.addFollowUp({ batchId: b, issueId: i, kind: 'note', actor: 'human', text: 'Also happens on the settings page' }), [JSON.parse(before).id, id])
  expect(added.result).toBe('added')
  const after = await page.evaluate(() => JSON.stringify(window.sg!.engine.session.store.get().submitted[0]))
  expect(after).toBe(before)
  const md = await page.evaluate(b => window.sg!.engine.session.markdown(JSON.parse(b)), before)
  expect(md).toContain('Follow-ups after submission')
})

test('a second window with the same identity forks instead of overwriting', async ({ context }) => {
  const one = await context.newPage()
  await one.goto('/plain.html?open')
  await addClipped(one)
  await expect.poll(() => status(one)).toBe('saved')
  const win = await one.evaluate(() => sessionStorage.getItem('smegglect:window:playground'))
  const two = await context.newPage()
  await two.addInitScript((w) => {
    sessionStorage.setItem('smegglect:window:playground', w!)
  }, win)
  await two.goto('/plain.html?open')
  await two.waitForFunction(() => window.sg!.engine.session.store.get().status.kind === 'saved')
  // Window one writes again, so window two's next save sees a newer revision.
  const savedAt = () => one.evaluate(() => {
    const s = window.sg!.engine.session.store.get().status
    return s.kind === 'saved' ? s.at : ''
  })
  const first = await savedAt()
  await one.waitForTimeout(5)
  await addClipped(one, '#box-a')
  await expect.poll(savedAt).not.toBe(first)
  await addClipped(two, '#box-b')
  await expect.poll(() => status(two)).toBe('forked')
  const ids = await two.evaluate(() => window.sg!.engine.session.store.get().windowId)
  expect(ids).not.toBe(win)
  await one.reload()
  await one.waitForFunction(() => window.sg?.engine.session.store.get().status.kind === 'saved')
  expect(await one.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(2)
})

test('a new window takes the last drafts when no open window holds them, as a restarted desktop app', async ({ context }) => {
  const drafts = (page: Page) => page.evaluate(async () => {
    await window.sg!.engine.session.ready
    return window.sg!.engine.state().drafts.issues.length
  })
  const one = await context.newPage()
  await one.goto('/plain.html?open')
  await addClipped(one)
  await expect.poll(() => status(one)).toBe('saved')
  // Opened beside it, a second window keeps drafts of its own.
  const two = await context.newPage()
  await two.goto('/plain.html?open')
  expect(await drafts(two)).toBe(0)
  await two.close()
  // Every window closed, as an app that restarts: the next one finds the issues again.
  await one.close()
  const three = await context.newPage()
  await three.goto('/plain.html?open')
  expect(await drafts(three)).toBe(1)
})
