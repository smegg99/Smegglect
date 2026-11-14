// tests/e2e/lifecycle.spec.ts
// C02, C03, C04, Q01, F01.
import { expect, test } from '@playwright/test'
import { instrument, owned, root, settle, ui } from './helpers'

test.beforeEach(async ({ page }) => {
  await instrument(page)
})

test('C02 importing the entry neither mounts, styles nor connects', async ({ page }) => {
  const requests: string[] = []
  page.on('request', r => requests.push(r.url()))
  // plain.ts imports the whole entry statically; ?manual skips mount().
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await settle(page)
  const state = await page.evaluate(() => ({
    sheets: [...document.styleSheets].map(s => s.href?.split('/').pop() ?? 'inline'),
    adopted: document.adoptedStyleSheets.length,
    root: document.querySelectorAll('smegglect-root').length,
    htmlChildren: [...document.documentElement.children].map(c => c.localName),
  }))
  expect(state).toEqual({ sheets: ['plain.css'], adopted: 0, root: 0, htmlChildren: ['head', 'body'] })
  expect(requests.filter(u => !u.startsWith(`${new URL(page.url()).origin}/`))).toEqual([])
})

test('C03 mount twice, destroy twice, remount', async ({ page }) => {
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  const result = await page.evaluate(() => {
    const m = window.smegglect.mount
    const a = m({ project: { id: 'p' } })
    const b = m({ project: { id: 'p' } })
    const same = a === b
    const count1 = document.querySelectorAll('smegglect-root').length
    a.destroy()
    a.destroy()
    const count2 = document.querySelectorAll('smegglect-root').length
    const c = m({ project: { id: 'p' } })
    const count3 = document.querySelectorAll('smegglect-root').length
    const other = m({ instance: 'second', project: { id: 'p' } })
    const count4 = document.querySelectorAll('smegglect-root').length
    other.destroy()
    c.destroy()
    return { same, count1, count2, count3, count4 }
  })
  expect(result).toEqual({ same: true, count1: 1, count2: 0, count3: 1, count4: 2 })
})

test('C04 destroy after use releases every owned resource', async ({ page }) => {
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  const baseline = await owned(page)
  await page.evaluate(() => {
    window.sg = window.smegglect.mount({ project: { id: 'p' }, open: true })
  })
  await settle(page)
  await ui(page, '[aria-label="Pick element"]').click()
  await page.mouse.move(300, 200)
  await page.click('#submit')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await settle(page)
  const active = await owned(page)
  expect(active.listeners).toBeGreaterThan(baseline.listeners ?? 0)
  await page.evaluate(() => window.sg!.destroy())
  await settle(page)
  expect(await owned(page)).toEqual(baseline)
  expect(await page.locator(root).count()).toBe(0)
})

test('Q01 collapsed runtime runs no frame loop and no observers', async ({ page }) => {
  await page.goto('/plain.html')
  await settle(page)
  const idle = await owned(page)
  await page.waitForTimeout(300)
  expect(idle.frames).toBe(0)
  expect(idle.observers).toBe(0)
  expect((await owned(page)).frames).toBe(0)
})

test('F01 a plain host mounts the compiled runtime without Vue', async ({ page }) => {
  await page.goto('/compiled.html')
  await page.waitForFunction(() => (window as unknown as { sg?: unknown }).sg)
  await expect(ui(page, '.launcher .key')).toBeVisible()
  await ui(page, '.launcher .key').click()
  await expect(ui(page, '.dock')).toBeVisible()
  const vue = await page.evaluate(() => 'Vue' in window || !!document.querySelector('[data-v-app]'))
  expect(vue).toBe(false)
})

test('C04 fifty mount, use and destroy cycles leave nothing behind', async ({ page }) => {
  await page.goto('/plain.html?manual&memory')
  await page.waitForFunction(() => !!window.smegglect)
  const baseline = await owned(page)
  await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const sg = window.smegglect.mount({ project: { id: 'stress' }, open: true, storage: 'memory' })
      sg.engine.togglePick()
      sg.engine.setMeasuring(true)
      sg.engine.setAnnotations(true)
      await new Promise(r => requestAnimationFrame(r))
      sg.destroy()
    }
  })
  await settle(page)
  expect(await owned(page)).toEqual(baseline)
  expect(await page.locator(root).count()).toBe(0)
  expect(await page.evaluate(() => (globalThis as unknown as Record<symbol, Map<string, unknown>>)[Symbol.for('smegglect.instances')]?.size ?? 0)).toBe(0)
})
