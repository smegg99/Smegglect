// tests/e2e/keyboard.spec.ts
// Keyboard-only use, and what Escape belongs to.
import { expect, test, type Page } from '@playwright/test'
import { action, ui } from './helpers'

const focused = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('smegglect-root')!.shadowRoot!
  const el = root.activeElement as HTMLElement | null
  return el ? (el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.localName) : `host:${document.activeElement?.id ?? ''}`
})

test('the dock is reachable by keyboard with arrow navigation and return focus', async ({ page }) => {
  await page.goto('/plain.html?memory')
  // Shortcuts are ignored inside text fields, so start from a button.
  await page.locator('#cancel').focus()
  await page.keyboard.press('Alt+Shift+S')
  await expect.poll(() => focused(page)).toBe('Pick element')
  await page.keyboard.press('ArrowRight')
  expect(await focused(page)).toBe('Draw region')
  await page.keyboard.press('End')
  expect(await focused(page)).toBe('More')
  await page.keyboard.press('Enter')
  await expect.poll(() => focused(page)).toBe('Collapse')
  await page.keyboard.press('ArrowDown')
  expect(await focused(page)).toBe('Pop out to a window')
  await page.keyboard.press('ArrowDown')
  expect(await focused(page)).toBe('Bottom')
  await page.keyboard.press('Escape')
  await expect.poll(() => focused(page)).toBe('More')
  await page.keyboard.press('ArrowLeft')
  expect(await focused(page)).toBe('Settings')
  await page.keyboard.press('ArrowLeft')
  expect(await focused(page)).toBe('Issues')
  await page.keyboard.press('Enter')
  await expect(ui(page, '.inspector')).toBeFocused()
  // The panel holds focus without drawing a ring around itself.
  expect(await ui(page, '.inspector').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none')
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await expect.poll(() => focused(page)).toBe('Issues')
  const ring = await ui(page, '.dock [aria-label="Issues"]').evaluate(el => getComputedStyle(el).outlineStyle)
  expect(ring).toBe('solid')
})

test('Escape cancels only what Smegglect owns', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  const hostEscapes = () => page.evaluate(() => (window as unknown as { escapes?: number }).escapes ?? 0)
  await page.evaluate(() => document.addEventListener('keydown', e => {
    if (e.key === 'Escape') (window as unknown as { escapes: number }).escapes = ((window as unknown as { escapes?: number }).escapes ?? 0) + 1
  }))
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.locator('#box-a').click()
  await (await action(page, 'match-width')).click()
  await expect(ui(page, '.inspector .waiting')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector .waiting')).toHaveCount(0)
  await expect(ui(page, '.inspector .target .name')).toHaveText('div "A"')
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector .empty')).toBeVisible()
  expect(await hostEscapes()).toBe(0)
  // Idle with a host field focused: the host gets its Escape, and the open inspector stays.
  await page.locator('#customer').focus()
  await page.keyboard.press('Escape')
  expect(await hostEscapes()).toBe(1)
  await expect(ui(page, '.inspector')).toBeVisible()
  // A host dialog closes on Escape when Smegglect has nothing to cancel.
  await ui(page, '.inspector [aria-label="Close inspector"]').click()
  await page.locator('#open-dialog').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('#dialog')).not.toBeVisible()
})

test('typing in host fields and IME composition never trigger shortcuts', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  await page.locator('#customer').focus()
  await page.keyboard.press('Alt+Shift+P')
  expect(await ui(page, '.dock [aria-label="Pick element"]').getAttribute('aria-pressed')).toBe('false')
  await page.locator('#customer').fill('')
  await page.keyboard.type('Pick me')
  expect(await page.inputValue('#customer')).toBe('Pick me')
})

test('Escape unwinds one step at a time: mode, selection, then the inspector', async ({ page }) => {
  await page.goto('/plain.html?open&memory')
  const now = () => page.evaluate(() => {
    const s = window.sg!.engine.state()
    return `${s.inspect.mode.kind}/${s.inspect.selection.kind}`
  })
  await ui(page, '.dock [aria-label="Pick element"]').click()
  await page.locator('#cancel').click()
  await expect(ui(page, '.inspector')).toBeVisible()
  expect(await now()).toBe('pass/dom')
  await page.keyboard.press('Alt+Shift+P')
  expect(await now()).toBe('pick/dom')
  await page.keyboard.press('Escape')
  expect(await now()).toBe('pass/dom')
  await expect(ui(page, '.inspector')).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await now()).toBe('pass/none')
  await expect(ui(page, '.inspector .empty')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ui(page, '.inspector')).toHaveCount(0)
})

