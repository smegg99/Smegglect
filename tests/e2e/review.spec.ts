// tests/e2e/review.spec.ts
// Stage 11: overlay -> local bridge -> MCP client -> results -> human review, end to end.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test, type Page } from '@playwright/test'
import { startBroker, type Broker } from '../../src/bridge/server'
import { preset, ui } from './helpers'

test.describe.configure({ mode: 'serial' })

let broker: Broker
let root: string
let mcp: Client

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sg-review-'))
  broker = await startBroker({ root, origins: [new URL(test.info().project.use.baseURL!).origin], log: () => {} })
  mcp = new Client({ name: 'review-test', version: '1' })
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/bridge-cli.js', 'mcp', '--root', root], stderr: 'ignore' }))
})

test.afterAll(async () => {
  await mcp?.close()
  await broker?.close()
})

async function tool(name: string, args: Record<string, unknown> = {}) {
  const res = await mcp.callTool({ name, arguments: args }) as { content: { text: string }[], isError?: boolean }
  return { text: res.content[0]?.text ?? '', isError: !!res.isError }
}

async function pick(page: Page, selector: string) {
  const key = ui(page, '.dock [aria-label="Pick element"]')
  if ((await key.getAttribute('aria-pressed')) !== 'true') await key.click()
  await page.locator(selector).click()
}

test('collect two issues, submit to the bridge, agent reports, human reopens one and accepts the other', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token }) => {
    window.sg = window.smegglect.mount({ project: { id: 'review' }, open: true, storage: 'memory', bridge: { url, token } })
  }, { url: broker.url, token: broker.token })

  await pick(page, '#clip')
  await preset(page, 'clipped')
  await pick(page, '#cancel')
  await preset(page, 'match-height', { b: '#submit' })

  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .status').filter({ hasText: 'Agent bridge' })).toHaveText(`Agent bridge connected at ${broker.url}`)
  await ui(page, '.inspector .foot .primary').click()
  await ui(page, '.report-view .foot button').filter({ hasText: 'Make available to agent' }).click()
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  await expect(ui(page, '.toast')).toContainText('/smegglect')

  const list = JSON.parse((await tool('list_batches')).text)
  expect(list).toHaveLength(1)
  const batchId = list[0].id as string
  const [clip, match] = list[0].issues as { id: string }[]
  const summary = JSON.parse((await tool('get_batch', { batch_id: batchId })).text)
  expect(summary.issues[1].task).toContain('Make the height of A match the height of B')
  expect(summary.issues[1].b.element.label).toBe('Save order')

  await tool('report_result', { batch_id: batchId, issue_id: clip!.id, state: 'needs-review', summary: 'Added a tooltip with the full text', files: ['src/List.vue'], checks: [{ command: 'bun run test', outcome: 'passed' }], result_id: 'c1' })
  await tool('report_result', { batch_id: batchId, issue_id: match!.id, state: 'needs-review', summary: '<b>Matched</b> both buttons to the control height token', result_id: 'm1' })

  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'Issues' }).click()
  await page.locator('smegglect-root .row .line').filter({ hasText: '2 issues' }).click()
  await expect(ui(page, '.frozen').first()).toContainText('Reported by the agent, not verified by Smegglect: Needs review')
  await expect(ui(page, '.frozen').first()).toContainText('Files: src/List.vue')
  await expect(ui(page, '.frozen').first()).toContainText('bun run test (passed)')
  await expect(ui(page, '.frozen').nth(1)).toContainText('<b>Matched</b>')
  expect(await page.evaluate(() => document.querySelector('smegglect-root')!.shadowRoot!.querySelectorAll('.frozen b').length)).toBe(0)

  // Reopen the first with a reason, accept the second.
  await ui(page, '.frozen').first().locator('button', { hasText: 'Reopen' }).click()
  await ui(page, '.frozen').first().locator('button', { hasText: 'Still happens' }).click()
  await ui(page, '.frozen').nth(1).locator('button', { hasText: 'Accept' }).click()
  await expect(ui(page, '.frozen').first().locator('.state')).toHaveText('Reopened')
  await expect(ui(page, '.frozen').nth(1).locator('.state')).toHaveText('Accepted')

  const after = JSON.parse((await tool('list_batches')).text)[0].issues.map((i: { state: string }) => i.state)
  expect(after).toEqual(['reopened', 'accepted'])

  // A stale agent result cannot undo acceptance; a blocked step is shown as blocked.
  await tool('report_result', { batch_id: batchId, issue_id: match!.id, state: 'needs-review', summary: 'late', result_id: 'late' })
  await tool('report_result', { batch_id: batchId, issue_id: clip!.id, state: 'blocked', summary: 'Cannot reproduce in a narrow window', checks: [{ command: 'visual check at 800px', outcome: 'not-run' }], result_id: 'c2' })
  const final = JSON.parse((await tool('list_batches')).text)[0].issues.map((i: { state: string }) => i.state)
  expect(final).toEqual(['blocked', 'accepted'])
  await ui(page, '.frozen').first().locator('xpath=ancestor::div[contains(@class,"details")]').locator('button', { hasText: 'Refresh agent results' }).click()
  await expect(ui(page, '.frozen').first().locator('.state')).toHaveText('Blocked')
  await expect(ui(page, '.frozen').first()).toContainText('visual check at 800px (not run)')
  await expect(ui(page, '.frozen').nth(1).locator('.state')).toHaveText('Accepted')
  if (process.env.SMEGGLECT_SHOTS) await page.screenshot({ path: 'docs/smegglect/evidence/chromium-review.png' })

  // The target of the first issue disappears: the row says so, the evidence stays.
  await page.evaluate(() => document.getElementById('clip')?.remove())
  await page.locator('smegglect-root .row .line').filter({ hasText: '2 issues' }).click()
  await page.locator('smegglect-root .row .line').filter({ hasText: '2 issues' }).click()
  await expect(ui(page, '.frozen').first()).toContainText('Target not found on this page')
  const evidence = await tool('get_issue_evidence', { batch_id: batchId, issue_id: clip!.id })
  expect(JSON.parse(evidence.text).issue.operands.a.element.tag).toBe('p')
})

/** Long-polls of the page channel that are still open. */
async function polls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { openPolls: number }).openPolls)
}

test('the page hears results by itself, re-measures an issue for the agent and tells it the selection', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token }) => {
    const w = window as unknown as { openPolls: number }
    w.openPolls = 0
    const plain = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (!String(input).includes('/v1/page/next')) return plain(input, init)
      w.openPolls++
      return plain(input, init).finally(() => w.openPolls--)
    }
    window.sg = window.smegglect.mount({ project: { id: 'review' }, open: true, storage: 'memory', bridge: { url, token } })
  }, { url: broker.url, token: broker.token })

  await pick(page, '#cancel')
  await preset(page, 'match-height', { b: '#submit' })
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot .primary').click()
  await ui(page, '.report-view .foot button').filter({ hasText: 'Make available to agent' }).click()
  const work = JSON.parse((await tool('next_work')).text).open as { batchId: string, issueId: string }[]
  expect(work).toHaveLength(1)
  const { batchId, issueId } = work[0]!

  // The agent asks the open page to find and measure the target again.
  const check = async () => JSON.parse((await tool('check_issue', { batch_id: batchId, issue_id: issueId })).text)
  const first = await check()
  expect(first).toMatchObject({ status: 'live', changes: [] })
  expect(first.now.a.bounds.height).toBe(40)
  expect(first.comparison.columns).toEqual(['A', 'B'])
  expect(first.note).toMatch(/untrusted/)
  await page.evaluate(() => (document.getElementById('cancel')!.style.height = '50px'))
  expect((await check()).changes).toContainEqual({ property: 'bounds.height', then: '40', now: '50' })
  // A fix that changes the text still finds its target, and says how.
  await page.evaluate(() => (document.getElementById('cancel')!.textContent = 'Abort'))
  expect(await check()).toMatchObject({ status: 'live', found: 'without-label' })

  // A result shows up without pressing anything.
  await page.locator('smegglect-root .row .line').filter({ hasText: '1 issue' }).click()
  await expect(ui(page, '.frozen').first().locator('.state')).toHaveText('Submitted')
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Heights matched', result_id: 'live1' })
  await expect(ui(page, '.frozen').first().locator('.state')).toHaveText('Needs review')
  await expect(ui(page, '.toast')).toContainText('1 issue to check')

  // What the person points at now.
  await pick(page, '#submit')
  const sel = JSON.parse((await tool('get_selection')).text)
  expect(sel).toMatchObject({ status: 'live', kind: 'dom', targets: ['button "Save order"'] })
  expect(Math.round(sel.bounds.width)).toBe(95)
  expect(sel.note).toMatch(/untrusted/)

  // The channel is open only while the overlay is.
  await expect.poll(() => polls(page)).toBe(1)
  await page.evaluate(() => window.sg!.engine.setExpanded(false))
  await expect.poll(() => polls(page)).toBe(0)
  await page.evaluate(() => window.sg!.engine.setExpanded(true))
  await expect.poll(() => polls(page)).toBe(1)
  await page.evaluate(() => window.sg!.destroy())
  await expect.poll(() => polls(page)).toBe(0)
})

test('a result is checked on the page: its plate shows the state, the issue view accepts it or sends it back', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token }) => {
    window.sg = window.smegglect.mount({ project: { id: 'review' }, open: true, storage: 'memory', bridge: { url, token } })
  }, { url: broker.url, token: broker.token })
  await pick(page, '#cancel')
  await preset(page, 'note', { note: 'Should say Abort' })
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot .primary').click()
  await ui(page, '.report-view .foot button').filter({ hasText: 'Make available to agent' }).click()
  const open = JSON.parse((await tool('next_work')).text).open as { batchId: string, issueId: string }[]
  expect(open).toHaveLength(1)
  const { batchId, issueId } = open[0]!
  const plate = ui(page, `.plate[data-id="${issueId}"]`)
  await expect(plate).toHaveCount(0)

  // The fix changed the button's text, as in the real run; its plate still finds it.
  await page.evaluate(() => (document.getElementById('cancel')!.textContent = 'Abort'))
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Renamed it to Abort', files: ['src/Form.vue'], result_id: 'p1' })
  await expect(plate.locator('.state')).toHaveText('Needs review')
  await expect(plate.locator('.plate-x')).toHaveCount(0)
  await plate.locator('.plate-main').click()
  const result = ui(page, '.inspector .issue-view .result')
  await expect(result).toContainText('Renamed it to Abort')
  await expect(result).toContainText('src/Form.vue')
  await expect(ui(page, '.inspector .issue-view')).not.toContainText('not registered')

  // Sent back with a reason and a note: the agent gets both.
  await result.getByRole('button', { name: 'Reopen' }).click()
  await result.getByRole('button', { name: 'Still happens' }).click()
  await result.locator('textarea').fill('The second form still says Cancel')
  await result.getByRole('button', { name: 'Send back' }).click()
  await expect(plate.locator('.state')).toHaveText('Reopened')
  const back = JSON.parse((await tool('next_work')).text).open
  expect(back).toEqual([expect.objectContaining({ issueId, state: 'reopened', said: ['still-happens: The second form still says Cancel'] })])

  // The next answer is accepted, and the mark leaves the page.
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Both forms say Abort', result_id: 'p2' })
  await expect(result).toContainText('Both forms say Abort')
  await result.getByRole('button', { name: 'Accept' }).click()
  await expect(plate).toHaveCount(0)
  const listed = JSON.parse((await tool('list_batches')).text) as { id: string, issues: { state: string }[] }[]
  expect(listed.find(b => b.id === batchId)!.issues[0]!.state).toBe('accepted')
})

test('answered issues are listed in the Issues tab; opening one moves the panel off its target', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token }) => {
    window.sg = window.smegglect.mount({ project: { id: 'review' }, open: true, storage: 'memory', bridge: { url, token } })
  }, { url: broker.url, token: broker.token })
  await pick(page, '#box-b')
  await preset(page, 'note', { note: 'Too pale' })
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot .primary').click()
  await ui(page, '.report-view .foot button').filter({ hasText: 'Make available to agent' }).click()
  await expect(ui(page, '.toast')).toContainText('Available to agents')
  const { batchId, issueId } = (JSON.parse((await tool('next_work')).text).open as { batchId: string, issueId: string }[])[0]!
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Darker fill', result_id: 'side1' })

  // The panel is on the right, over the target and its plate.
  const row = ui(page, `.inspector [data-tree="issues"] [data-sent="${issueId}"]`)
  await expect(row).toContainText('Needs review')
  const target = (await page.locator('#box-b').boundingBox())!
  expect((await ui(page, '.inspector').boundingBox())!.x).toBeLessThan(target.x + target.width)
  await row.click()
  await expect(ui(page, '.inspector .issue-view .result')).toContainText('Darker fill')
  await expect.poll(async () => (await ui(page, '.inspector').boundingBox())!.x + (await ui(page, '.inspector').boundingBox())!.width).toBeLessThan(target.x)
  const plate = (await ui(page, `.plate[data-id="${issueId}"]`).boundingBox())!
  const panel = (await ui(page, '.inspector').boundingBox())!
  expect(plate.x).toBeGreaterThan(panel.x + panel.width)
})
