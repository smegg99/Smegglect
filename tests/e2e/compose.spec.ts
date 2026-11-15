// tests/e2e/compose.spec.ts
// Adding an issue on one screen, sending from the Issues tab, one panel size, and labels that fit in every language.
import { expect, test, type Page } from '@playwright/test'
import { draftIssues, footRhythm, pick, ui } from './helpers'

const panel = async (page: Page) => {
  const b = (await ui(page, '.inspector').boundingBox())!
  return { width: Math.round(b.width), height: Math.round(b.height) }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/plain.html?open&memory')
})

const picked = (page: Page) => ui(page, '.inspector [data-tree="actions"] [aria-selected="true"]')

test('an issue is added from one screen: write what is wrong and press Ctrl+Enter; the type is optional', async ({ page }) => {
  await pick(page, '#cancel')
  const compose = ui(page, '.inspector .compose')
  await expect(picked(page)).toHaveText('Note')
  await expect(compose.locator('.kind')).toHaveText('Note')
  await expect(compose.locator('.add')).toBeDisabled()
  await compose.locator('textarea').fill('The label should say Abort')
  await compose.locator('textarea').press('Control+Enter')
  await expect(ui(page, '.toast')).toContainText('Issue 1 added')
  await expect(compose.locator('textarea')).toHaveValue('')
  // A type from the tree, without its option and without a note, is enough.
  await ui(page, '.inspector [data-tree="actions"] [data-preset="spacing"]').click()
  await expect(compose.locator('.kind')).toHaveText('Spacing')
  await compose.locator('.add').click()
  const list = await draftIssues(page)
  expect(list.map(i => [i.intent.preset.id, i.intent.note, i.intent.params])).toEqual([['note', 'The label should say Abort', {}], ['spacing', '', {}]])
  expect(list.map(i => i.intent.scope)).toEqual(['occurrence', 'occurrence'])
  await expect(picked(page)).toHaveText('Note')
})

test('the types are a tree that is always there; picking the picked one again goes back to a note', async ({ page }) => {
  await pick(page, '#cancel')
  const spacing = ui(page, '.inspector [data-tree="actions"] [data-preset="spacing"]')
  await expect(spacing).toBeVisible()
  await spacing.click()
  await expect(spacing).toHaveAttribute('aria-selected', 'true')
  await spacing.click()
  await expect(picked(page)).toHaveText('Note')
})

test('a type that needs a second element asks for it on the page and stays on the same screen', async ({ page }) => {
  await pick(page, '#cancel')
  const compose = ui(page, '.inspector .compose')
  await ui(page, '.inspector [data-tree="actions"] [data-preset="match-height"]').click()
  await expect(ui(page, '.inspector .waiting')).toContainText('Pick B')
  await expect(compose).toBeVisible()
  await page.locator('#submit').click()
  await expect(ui(page, '.inspector .reference')).toContainText('button "Save order"')
  await compose.locator('.add').click()
  const list = await draftIssues(page)
  expect(list.map(i => i.intent.preset.id)).toEqual(['match-height'])
  expect(list[0]!.operands.b?.kind).toBe('dom')
})

test('one checkbox says the fix belongs in the shared component', async ({ page }) => {
  await pick(page, '#cancel')
  const compose = ui(page, '.inspector .compose')
  await compose.getByRole('checkbox', { name: 'Everywhere this component is used' }).check()
  await compose.locator('textarea').fill('Rename it')
  await compose.locator('.add').click()
  expect((await draftIssues(page)).map(i => i.intent.scope)).toEqual(['component'])
})

test('the panel keeps one size: picking, choosing B, issues, an issue, sending', async ({ page }) => {
  await pick(page, '#cancel')
  const size = await panel(page)
  await ui(page, '.dock [aria-label="Pick element"]').click()
  expect(await panel(page)).toEqual(size)
  await page.keyboard.press('Escape')
  const compose = ui(page, '.inspector .compose')
  await ui(page, '.inspector [data-tree="actions"] [data-preset="match-width"]').click()
  expect(await panel(page)).toEqual(size)
  await page.locator('#submit').click()
  await compose.locator('.add').click()
  await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
  expect(await panel(page)).toEqual(size)
  await ui(page, '.inspector [data-tree="issues"] [data-issue]').first().click()
  expect(await panel(page)).toEqual(size)
})

test('issues are sent from the Issues tab: copy the prompt or save the .zip, with no review screen', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
  await ui(page, '.inspector .foot button').filter({ hasText: 'Copy prompt' }).click()
  await expect(ui(page, '.toast')).toContainText('Prompt copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Rename it')
  expect(await page.evaluate(() => window.sg!.engine.session.store.get().submitted.length)).toBe(1)
})

test('the send area keeps one rhythm: buttons of one height, 8 px between everything', async ({ page }) => {
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
  const { heights, gaps } = await footRhythm(page)
  expect(heights.length).toBeGreaterThanOrEqual(2)
  expect(new Set(heights).size).toBe(1)
  expect(gaps.length).toBeGreaterThan(0)
  expect([...new Set(gaps)]).toEqual([8])
})

test('sent reports are a branch of the Issues tree: a report has its keys, its issues open their view', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permission')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await pick(page, '#cancel')
  await ui(page, '.inspector .compose textarea').fill('Rename it')
  await ui(page, '.inspector .compose .add').click()
  await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
  await ui(page, '.inspector .foot button').filter({ hasText: 'Copy prompt' }).click()
  const report = ui(page, '.inspector [data-tree="issues"] [data-batch]')
  await expect(report).toHaveCount(1)
  for (const name of ['Copy prompt', 'Download .zip', 'Delete report']) await expect(report.getByRole('button', { name })).toBeVisible()
  await report.click()
  const sent = ui(page, '.inspector [data-tree="issues"] [data-sent-issue]')
  await expect(sent).toHaveCount(1)
  await expect(sent.locator('.tree-meta')).toHaveText('button "Cancel"')
  await sent.click()
  await expect(ui(page, '.inspector .issue-view textarea')).toHaveValue('Rename it')
  await ui(page, '.inspector .issue-view [aria-label="Back"]').click()
  await report.getByRole('button', { name: 'Delete report' }).click()
  await expect(report).toHaveCount(0)
  await expect(ui(page, '.inspector [data-tree="issues"] [data-sent-issue]')).toHaveCount(0)
})

for (const locale of ['en', 'pl']) {
  test(`every button and label fits on one line in ${locale}, at the side and as a sheet`, async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/plain.html?manual')
      await page.waitForFunction(() => !!window.smegglect)
      await page.evaluate(l => { window.sg = window.smegglect.mount({ project: { id: 'fit' }, open: true, storage: 'memory', locale: l }) }, locale)
      await page.keyboard.press('Alt+Shift+P')
      await page.locator('#cancel').click()
      const views = [
        async () => {},
        async () => {
          await ui(page, '.inspector .compose textarea').fill('x')
          await ui(page, '.inspector .compose .add').click()
          await ui(page, '.inspector .tabstrip [role="tab"]').nth(1).click()
        },
        async () => ui(page, '.inspector [data-tree="issues"] [data-issue]').first().click(),
        async () => ui(page, '.dock [aria-haspopup="menu"]').first().click(),
        async () => {
          await page.keyboard.press('Escape')
          await ui(page, '.inspector .tabstrip [role="tab"]').first().click()
          await page.keyboard.press('Alt+Shift+P')
        },
        async () => {
          await page.keyboard.press('Escape')
              await ui(page, '.inspector [data-tree="actions"] [data-preset="match-height"]').click()
        },
        // Settings, every setting, and the confirmation before clearing.
        async () => {
          await page.keyboard.press('Escape')
          await ui(page, '.dock [data-tool="settings"]').click()
        },
        async () => ui(page, '.inspector .settings .v-btn--variant-tonal').click(),
      ]
      for (const open of views) {
        await open()
        const bad = await page.evaluate(() => {
          const root = document.querySelector('smegglect-root')!.shadowRoot!
          // Text lines only: an icon beside the text is not a second line, and a count pill sits a pixel or two lower.
          const lines = (el: Element) => {
            const tops: number[] = []
            const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
            for (let n = walk.nextNode(); n; n = walk.nextNode()) {
              if (!n.textContent!.trim() || n.parentElement!.closest('[aria-hidden="true"]')) continue
              const range = document.createRange()
              range.selectNodeContents(n)
              for (const r of range.getClientRects()) if (r.width > 0 && !tops.some(t => Math.abs(t - r.top) < 6)) tops.push(r.top)
            }
            return tops.length
          }
          return [...root.querySelectorAll('button, [role="tab"], .label, .tree-name, .chip .name, h2, h3, .waiting-text')]
            .filter(el => (el as HTMLElement).offsetParent !== null && el.textContent!.trim())
            .filter(el => !el.closest('.tree-name') || el.classList.contains('tree-name'))
            // An instruction in the header may take two lines; nothing may be cut off.
            .filter(el => el.scrollWidth > el.clientWidth + 1 || lines(el) > (el.classList.contains('waiting-text') ? 2 : 1))
            // Captured page text (target names) is data and may be shortened; the overlay's own words may not.
            .filter(el => !el.closest('.chip, [data-tree="members"], .tree-meta'))
            // A plate is a title with the note under it, on purpose.
            .filter(el => !el.classList.contains('plate-main'))
            .map(el => `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent!.trim().slice(0, 40)}`)
        })
        expect(bad, `${locale} ${width}`).toEqual([])
      }
      await page.evaluate(() => window.sg!.destroy())
    }
  })
}
