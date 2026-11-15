// tests/e2e/paste.spec.ts
// An image on the clipboard pastes into an issue (Ctrl+V), and selecting an issue never moves the app: no
// "go to page", no scrolling to its target unless the person asks.
import { expect, test, type Page } from '@playwright/test'
import { pick, ui } from './helpers'

/** Pastes a 1x1 PNG into the element, as Ctrl+V with a screenshot on the clipboard does. */
async function pasteImage(page: Page, selector: string) {
  await ui(page, selector).evaluate((element) => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const bytes = Uint8Array.from(atob(png), letter => letter.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], '', { type: 'image/png' }))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }))
  })
}

/** Firefox drops `clipboardData` from a ClipboardEvent a script makes; a real Ctrl+V carries it. */
const SYNTHETIC = 'Firefox ignores clipboardData on a synthetic paste event'

const attachmentsOf = (page: Page) => page.evaluate(() => {
  const issue = window.sg!.engine.state().drafts.issues.at(-1)
  return window.sg!.engine.session.store.get().attachments.filter(attachment => attachment.issueId === issue?.id)
})

test('an image pasted while writing an issue is attached when it is added', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', SYNTHETIC)
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Look at this')
  await pasteImage(page, '.inspector .compose textarea')
  await expect(ui(page, '.inspector .compose .pasted')).toContainText('1 pasted image will be attached')
  await ui(page, '.inspector .compose .add').click()
  const attached = await attachmentsOf(page)
  expect(attached).toHaveLength(1)
  expect(attached[0]).toMatchObject({ name: 'pasted image', mime: 'image/png', review: 'pending' })
  await expect(ui(page, '.inspector .compose .pasted')).toHaveCount(0)
})

test('an image pasted into an open draft issue is attached to it', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', SYNTHETIC)
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('See the picture')
  await ui(page, '.inspector .compose .add').click()
  await ui(page, '.dock [data-tool="issues"]').click()
  await ui(page, '.inspector [data-tree="issues"] [data-issue]').first().click()
  await expect(ui(page, '.inspector .issue-view .paste-hint')).toBeVisible()
  await pasteImage(page, '.inspector .issue-view')
  expect(await attachmentsOf(page)).toHaveLength(1)
  await expect(ui(page, '.inspector .issue-view .paste-hint')).toHaveCount(0)
})

test('selecting an issue keeps the app where it is: no link to its page, no scroll to its target', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto('/plain.html?open&memory')
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  // Another page's issue, as if added there: its group must not offer to go to it.
  await page.evaluate(() => {
    const issue = window.sg!.engine.state().drafts.issues[0]!
    const elsewhere = { ...issue, id: 'iss_elsewhere', seq: 2, evidence: { ...issue.evidence, capture: { ...issue.evidence.capture, location: 'http://127.0.0.1/other' } } }
    const drafts = window.sg!.engine.state().drafts
    window.sg!.engine.replaceDrafts({ ...drafts, issues: [...drafts.issues, elsewhere] })
  })
  await ui(page, '.dock [data-tool="issues"]').click()
  await expect(ui(page, '.inspector [data-tree="issues"] [data-page] button')).toHaveCount(0)
  // Opening an issue from the history leaves the page scrolled where it was.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const scrolled = await page.evaluate(() => window.scrollY)
  await ui(page, '.inspector .tabstrip [role="tab"]').filter({ hasText: 'History' }).click()
  await ui(page, '.inspector .history .link').first().click()
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  // So does opening it from its row on the Issues tab.
  await ui(page, '.inspector .issue-view [aria-label="Back"]').click()
  await ui(page, '.inspector .tabstrip [role="tab"]').filter({ hasText: 'Issues' }).click()
  const id = await page.evaluate(() => window.sg!.engine.state().drafts.issues[0]!.id)
  await ui(page, `.inspector [data-tree="issues"] .tree-row[data-node="${id}"]`).click()
  await expect(ui(page, '.inspector .issue-view')).toBeVisible()
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  expect(page.url()).toContain('/plain.html')
})
