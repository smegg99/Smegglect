// tests/fixtures/adapters.spec.ts
// F01-F03, P07, Q03 against consumers of the packed tarball.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { Smegglect } from '../../src/overlay/index'

function instance(page: Page) {
  return page.evaluate(() => {
    const map = (globalThis as unknown as Record<symbol, Map<string, Smegglect>>)[Symbol.for('smegglect.instances')]
    return map ? map.size : 0
  })
}

async function pickAndClip(page: Page, selector: string) {
  await page.evaluate(() => {
    const sg = (globalThis as unknown as Record<symbol, Map<string, Smegglect>>)[Symbol.for('smegglect.instances')]!.get('default')!
    sg.engine.setExpanded(true)
  })
  await page.locator('smegglect-root .dock [aria-label="Pick element"]').click()
  await page.locator(selector).click()
  await page.locator('smegglect-root .inspector [data-tree="actions"] [data-preset="clipped"]').first().click()
  await page.locator('smegglect-root .inspector .form .key.primary').click()
  return page.evaluate(async () => {
    const sg = (globalThis as unknown as Record<symbol, Map<string, Smegglect>>)[Symbol.for('smegglect.instances')]!.get('default')!
    for (let i = 0; i < 50 && !sg.engine.state().drafts.issues.length; i++) await new Promise(r => setTimeout(r, 20))
    return sg.engine.state().drafts.issues[0]!.evidence
  })
}

test('F02 Vite + Vue: component ownership is reported at component level with provenance', async ({ page }) => {
  await page.goto('http://127.0.0.1:5201/')
  await page.waitForSelector('smegglect-root', { state: 'attached' })
  const ev = await pickAndClip(page, '.task >> nth=1 >> .done')
  expect(ev.a.source).toMatchObject({ quality: 'component', provenance: 'vue-instance', component: 'DoneButton', file: 'src/components/DoneButton.vue' })
  expect(ev.a.source.owners).toEqual(['DoneButton', 'TaskRow', 'App'])
  expect(ev.a.source.line).toBeUndefined()
})

test('F03 plugin plus a manual mount keeps one runtime', async ({ page }) => {
  await page.goto('http://127.0.0.1:5201/?manual')
  await page.waitForFunction(() => (window as unknown as { manual?: unknown }).manual)
  expect(await instance(page)).toBe(1)
  expect(await page.locator('smegglect-root').count()).toBe(1)
})

test('F02 Nuxt + Vuetify: the user component owns a Vuetify button; library internals are not the edit location', async ({ page }) => {
  await page.goto('http://127.0.0.1:5203/')
  await page.waitForSelector('smegglect-root', { state: 'attached', timeout: 30_000 })
  const ev = await pickAndClip(page, '.book >> nth=1')
  expect(ev.a.source.quality).toBe('component')
  expect(ev.a.source.component).toBe('ItemCard')
  expect(ev.a.source.file).toBe('app/components/ItemCard.vue')
  expect(ev.a.source.owners?.[0]).toMatch(/^VBtn \((library|external)\)$/)
  expect(ev.capture.screen).toBe('index')
  expect(ev.context[0]).toMatchObject({ provider: 'route', fields: { name: 'index', path: '/' } })
})

test('F02 Nuxt: a client-side route change keeps one overlay and new captures use the new screen', async ({ page }) => {
  await page.goto('http://127.0.0.1:5203/')
  await page.waitForSelector('smegglect-root', { state: 'attached', timeout: 30_000 })
  await page.click('#to-about')
  await page.waitForURL('**/about')
  expect(await page.locator('smegglect-root').count()).toBe(1)
  const ev = await pickAndClip(page, 'h1')
  expect(ev.capture.screen).toBe('about')
})

test('Q03 F01 the packed tarball works in a page with no bundler and no Vue', async ({ page }) => {
  const requests: string[] = []
  page.on('request', r => requests.push(new URL(r.url()).pathname))
  await page.goto('http://127.0.0.1:5204/')
  await expect(page.locator('smegglect-root .dock')).toBeVisible()
  await page.locator('smegglect-root .dock [aria-label="Pick element"]').click()
  await page.click('#go')
  await expect(page.locator('smegglect-root .inspector .target')).toContainText('button "Go"')
  expect(requests.every(p => p === '/' || p.startsWith('/node_modules/smegglect/dist/'))).toBe(true)
  expect(await page.evaluate(() => 'Vue' in window)).toBe(false)
})

test('Vite plugin starts the bridge with the dev server and the page connects to it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser checks the shared broker')
  const { url } = JSON.parse(readFileSync('fixtures/vite-vue/.smegglect/bridge.json', 'utf8')) as { url: string }
  await page.goto('http://127.0.0.1:5201/')
  await page.waitForSelector('smegglect-root', { state: 'attached' })
  await page.evaluate(() => {
    const sg = (globalThis as unknown as Record<symbol, Map<string, Smegglect>>)[Symbol.for('smegglect.instances')]!.get('default')!
    sg.engine.setExpanded(true)
  })
  await page.locator('smegglect-root .dock [aria-label^="Issues"]').click()
  await expect(page.locator('smegglect-root .inspector .status').filter({ hasText: 'Agent bridge' })).toHaveText(`Agent bridge connected at ${url}`)
})
