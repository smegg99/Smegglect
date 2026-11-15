// tests/e2e/settings.spec.ts
// Settings: a tab of its own, also opened by its key on the toolbar, built on Vuetify and S99AB, each setting
// taking effect at once and remembered; a mount option fixes one; nothing of Vuetify reaches the host page.
import { expect, test, type Page } from '@playwright/test'
import { pick, settingSwitch, ui } from './helpers'

const prefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('smegglect:prefs:playground') ?? '{}'))
const choice = (page: Page, text: string) => ui(page, '.inspector .settings .tool-key').filter({ hasText: text })
const settingsTab = (page: Page) => ui(page, '.inspector .tabstrip [data-tab="settings"]')

async function openSettings(page: Page) {
  await ui(page, '.dock [data-tool="settings"]').click()
  await expect(settingsTab(page)).toHaveAttribute('aria-selected', 'true')
}

test('Settings is a tab, the last one, also opened and closed by its key on the toolbar', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await openSettings(page)
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Settings')
  await expect(ui(page, '.inspector .settings')).toBeVisible()
  await expect(ui(page, '.dock [data-tool="settings"]')).toHaveAttribute('aria-expanded', 'true')
  await ui(page, '.dock [data-tool="settings"]').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  // From another tab, Settings is one click or arrow away.
  await ui(page, '.dock [data-tool="issues"]').click()
  await expect(ui(page, '.inspector .tabstrip [role="tab"]')).toHaveText(['Element', 'Issues', 'History', ''])
  await settingsTab(page).click()
  await expect(ui(page, '.inspector .settings')).toBeVisible()
  await settingsTab(page).press('ArrowLeft')
  await expect(ui(page, '.inspector .tabstrip [aria-selected="true"]')).toHaveText('History')
})

test('switching the language relabels the open overlay at once, without a remount, and is remembered', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  // A mark on the overlay's elements survives only if they are the same elements afterwards.
  await page.evaluate(() => {
    const root = document.querySelector('smegglect-root')!.shadowRoot!
    for (const selector of ['.sg', '.dock', '.inspector']) (root.querySelector(selector) as unknown as { mark: number }).mark = 1
  })
  await openSettings(page)
  await choice(page, 'Polski').click()
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Ustawienia')
  await expect(ui(page, '.dock [data-tool="pick"]')).toHaveAttribute('aria-label', 'Wybierz element')
  await expect(ui(page, '.inspector .settings h3').first()).toHaveText('Wygląd')
  const marks = await page.evaluate(() => {
    const root = document.querySelector('smegglect-root')!.shadowRoot!
    return ['.sg', '.dock', '.inspector'].map(selector => (root.querySelector(selector) as unknown as { mark?: number }).mark)
  })
  expect(marks).toEqual([1, 1, 1])
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(1)
  expect((await prefs(page)).language).toBe('pl')

  await page.reload()
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  await expect(ui(page, '.dock [data-tool="pick"]')).toHaveAttribute('aria-label', 'Wybierz element')
})

test("the app's locale is the default language, and the person can still choose another", async ({ page }) => {
  await page.goto('/plain.html?open&memory&locale=pl')
  await openSettings(page)
  // Auto follows the app's language.
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Ustawienia')
  await expect(choice(page, 'Auto').first()).toHaveAttribute('aria-pressed', 'true')
  for (const button of await ui(page, '.inspector .settings .tool-group').first().locator('.tool-key').all()) {
    await expect(button).toBeEnabled()
  }
  await choice(page, 'English').click()
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Settings')
  // The choice is remembered and wins over the app's language after a reload.
  await page.reload()
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  await openSettings(page)
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Settings')
  await choice(page, 'Auto').first().click()
  await expect(settingsTab(page)).toHaveAttribute('aria-label', 'Ustawienia')
})

test('theme, accent, labels and large keys take effect at once and are remembered', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await openSettings(page)
  const root = ui(page, '.sg').first()
  // The theme's choices are icons, each named by its label.
  await ui(page, '.inspector .settings .tool-key[aria-label="Dark"]').click()
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await ui(page, '.inspector .settings .swatch[aria-label="#3b82f6"]').click()
  await expect.poll(() => root.evaluate(el => el.style.getPropertyValue('--sg-select'))).toBe('#3b82f6')
  // Vuetify's accent follows: the on-state of a switch is drawn in it.
  const track = ui(page, '.inspector .settings .v-switch__track.bg-accent').first()
  await expect.poll(() => track.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(59, 130, 246)')
  await settingSwitch(page, 'Labels under the keys').uncheck()
  await expect(ui(page, '.dock .caption')).toHaveCount(0)
  await settingSwitch(page, 'Larger keys').check()
  await expect(root).toHaveAttribute('data-large', 'true')
  expect(await prefs(page)).toMatchObject({ theme: 'dark', accent: '#3b82f6', labels: false, large: true })

  await page.reload()
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  await expect(root).toHaveAttribute('data-theme', 'dark')
  await expect(root).toHaveAttribute('data-large', 'true')
  expect(await root.evaluate(el => el.style.getPropertyValue('--sg-select'))).toBe('#3b82f6')
  await expect(ui(page, '.dock .caption')).toHaveCount(0)
  await openSettings(page)
  await ui(page, '.inspector .settings .swatch.theme').click()
  expect(await root.evaluate(el => el.style.getPropertyValue('--sg-select'))).toBe('')
})

test('shortcuts can be turned off and stay off', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await openSettings(page)
  await settingSwitch(page, 'Alt+Shift shortcuts').uncheck()
  await page.locator('#customer').focus()
  await page.locator('#customer').blur()
  await page.keyboard.press('Alt+Shift+M')
  expect(await page.evaluate(() => window.sg!.engine.state().measuring)).toBe(false)
  await page.reload()
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  await page.keyboard.press('Alt+Shift+M')
  expect(await page.evaluate(() => window.sg!.engine.state().measuring)).toBe(false)
  expect((await prefs(page)).shortcuts).toBe(false)
})

test('a watch-only page tells the bridge on every poll, and stays so', async ({ page }) => {
  const polls: string[] = []
  await page.route('http://127.0.0.1:59871/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/v1/page/next') polls.push(url.search)
    const answers: Record<string, unknown> = {
      '/v1/health': { ok: true, version: '9.9.9', root: '/work/demo' },
      '/v1/batches': [],
    }
    const body = answers[url.pathname] ?? { seq: 1, events: [] }
    // As the broker does: an admitted origin gets CORS headers, and the preflight its answer.
    const headers = {
      'access-control-allow-origin': new URL(page.url()).origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, PUT',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    await new Promise(done => setTimeout(done, 50))
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const mountWithBridge = () => page.evaluate(() => {
    window.sg = window.smegglect.mount({
      project: { id: 'playground' },
      open: true,
      storage: 'memory',
      bridge: { url: 'http://127.0.0.1:59871', token: 't' },
    })
  })
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await mountWithBridge()
  await openSettings(page)
  await expect(ui(page, '.inspector .settings .about')).toContainText('/work/demo')
  await expect(ui(page, '.inspector .settings .about')).toContainText('http://127.0.0.1:59871')
  await expect.poll(() => polls.length).toBeGreaterThan(0)
  expect(polls.at(-1)).not.toContain('observer=1')
  await settingSwitch(page, 'Only watch this page').check()
  const before = polls.length
  await expect.poll(() => polls.slice(before).some(query => query.includes('observer=1'))).toBe(true)

  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  const after = polls.length
  await mountWithBridge()
  await expect.poll(() => polls.length).toBeGreaterThan(after)
  expect(polls.slice(after).every(query => query.includes('observer=1'))).toBe(true)
})

test('stored data says where it is kept and clears drafts and history after a confirmation', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  await openSettings(page)
  const data = ui(page, '.inspector .settings .form-section').filter({ hasText: 'Data' })
  await expect(data).toContainText('only in memory')
  await data.getByRole('button', { name: 'Clear drafts and history' }).click()
  await expect(data).toContainText('Sent reports stay')
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(1)
  await data.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(ui(page, '.toast')).toContainText('Drafts and history cleared')
  expect(await page.evaluate(() => window.sg!.engine.state().drafts.issues.length)).toBe(0)
  expect(await page.evaluate(() => window.sg!.engine.session.store.get().history.length)).toBe(0)
})

test('About shows the version and, without a bridge, says there is none', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await openSettings(page)
  const about = ui(page, '.inspector .settings .about')
  await expect(about).toContainText('Version')
  await expect(about).toContainText('dev')
  await expect(about).toContainText('None')
})

test('Vuetify lives in the shadow root: the host page gains no style, and its theme reaches the controls', async ({ page }) => {
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  const head = () => page.evaluate(() => document.head.querySelectorAll('style, link[rel="stylesheet"]').length)
  const before = await head()
  await page.evaluate(() => {
    window.sg = window.smegglect.mount({ project: { id: 'playground' }, open: true, storage: 'memory' })
  })
  await openSettings(page)
  expect(await head()).toBe(before)
  const accent = await ui(page, '.inspector .settings .v-switch__track.bg-accent').first()
    .evaluate(el => getComputedStyle(el).backgroundColor)
  expect(accent).not.toBe('rgba(0, 0, 0, 0)')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--v-theme-accent'))).toBe('')
})
