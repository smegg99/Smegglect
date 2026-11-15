// tests/e2e/isolation.spec.ts
// Hostile host CSS, no layout shift, themes and small viewports, reduced motion.
import { expect, test } from '@playwright/test'
import { preset, settle, ui } from './helpers'

test('a hostile host keeps its computed styles and the toolkit stays usable', async ({ page }) => {
  await page.goto('/hostile.html')
  await page.waitForFunction(() => typeof (window as unknown as { snapshot?: unknown }).snapshot === 'function')
  const before = await page.evaluate(() => (window as unknown as { snapshot: () => string }).snapshot())
  await page.evaluate(() => (window as unknown as { mountNow: () => void }).mountNow())
  await expect(ui(page, '.dock')).toBeVisible()
  const key = ui(page, '.dock [aria-label="Pick element"]')
  const box = (await key.boundingBox())!
  // Host CSS (40px root font, padding on every button) must not resize the overlay's keys.
  expect(box.width).toBeGreaterThanOrEqual(32)
  expect(box.width).toBeLessThan(60)
  expect(box.height).toBeGreaterThanOrEqual(32)
  expect(box.height).toBeLessThan(50)
  const font = await key.evaluate(el => getComputedStyle(el).fontFamily)
  expect(font).not.toContain('Comic')
  await key.click()
  await page.locator('#host-one').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  await preset(page, 'size')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector [role=tab][aria-selected=true]')).toContainText('Issues')
  await ui(page, '.dock [aria-label="Measurements"]').click()
  await settle(page)
  const after = await page.evaluate(() => (window as unknown as { snapshot: () => string }).snapshot())
  expect(after).toBe(before)
  const hostAttrs = await page.evaluate(() => [...document.querySelectorAll('body *')].flatMap(el => [...el.attributes].map(a => a.name)).filter(n => n.startsWith('data-sg') || n.startsWith('data-smegglect')))
  expect(hostAttrs).toEqual([])
})

test('overlay theme follows the host page; panels clamp to a small viewport', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  expect(await ui(page, '.sg').getAttribute('data-theme')).toBe('light')
  await page.goto('/workbench.html?open')
  expect(await ui(page, '.sg').getAttribute('data-theme')).toBe('dark')
  await page.setViewportSize({ width: 360, height: 560 })
  await page.goto('/plain.html?open&memory')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await settle(page)
  const sheet = (await ui(page, '.inspector').boundingBox())!
  const dock = (await ui(page, '.dock').boundingBox())!
  expect(sheet.x).toBeGreaterThanOrEqual(8)
  expect(sheet.x + sheet.width).toBeLessThanOrEqual(352)
  expect(sheet.y + sheet.height <= dock.y || dock.y + dock.height <= sheet.y).toBe(true)
  expect(dock.x).toBeGreaterThanOrEqual(0)
  expect(dock.x + dock.width).toBeLessThanOrEqual(360)
  await ui(page, '.dock [aria-label="More"]').click()
  const menu = (await ui(page, '.pop').boundingBox())!
  expect(menu.y).toBeGreaterThanOrEqual(8)
  expect(menu.x + menu.width).toBeLessThanOrEqual(352)
})

test('reduced motion removes transitions; larger controls stay reachable', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 800, height: 600 } })
  const page = await context.newPage()
  await page.goto('/plain.html?open&memory')
  const duration = await ui(page, '.dock .key').first().evaluate(el => getComputedStyle(el).transitionDuration)
  expect(duration.split(',').every(d => parseFloat(d) === 0)).toBe(true)
  await page.evaluate(() => window.sg!.update({ large: true, labels: true }))
  await settle(page)
  const key = (await ui(page, '.dock [aria-label="Pick element"]').boundingBox())!
  expect(Math.round(key.width)).toBeGreaterThanOrEqual(36)
  await expect(ui(page, '.dock .caption').first()).toHaveText('Pick')
  await context.close()
})
