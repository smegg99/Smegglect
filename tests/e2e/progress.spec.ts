// tests/e2e/progress.spec.ts
// Claude's progress on the page: each sent issue's state, a check seen on its target, results as toasts.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test, type Page } from '@playwright/test'
import { startBroker, type Broker } from '../../src/bridge/server'
import { pick, preset, ui } from './helpers'

test.describe.configure({ mode: 'serial' })

let broker: Broker | undefined
let mcp: Client | undefined

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  const root = mkdtempSync(join(tmpdir(), 'sg-progress-'))
  broker = await startBroker({ root, origins: [new URL(test.info().project.use.baseURL!).origin], log: () => {} })
  // Named as Claude Code names itself, so the page says Claude.
  mcp = new Client({ name: 'claude-code', version: '1' })
  await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/bridge-cli.js', 'mcp', '--root', root], stderr: 'ignore' }))
})

test.afterEach(async () => {
  await mcp?.close()
  await broker?.close()
  mcp = undefined
  broker = undefined
})

async function tool(name: string, args: Record<string, unknown> = {}) {
  const res = await mcp!.callTool({ name, arguments: args }) as { content: { text: string }[] }
  const text = res.content[0]?.text ?? ''
  // Some tools answer in a sentence, not JSON.
  return text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text
}

async function mount(page: Page, storage: 'memory' | 'auto' = 'memory') {
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token, storage }) => {
    window.sg = window.smegglect.mount({ project: { id: 'progress' }, open: true, storage, bridge: { url, token } })
  }, { url: broker!.url, token: broker!.token, storage })
}

/** A note on each target, sent to the bridge; the batch's id and its issues' ids, in order. */
async function send(page: Page, targets: string[]) {
  for (const target of targets) {
    await pick(page, target)
    await preset(page, 'note', { note: `Look at ${target}` })
  }
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  const [batch] = await tool('list_batches') as { id: string, issues: { id: string }[] }[]
  await ui(page, `.inspector [data-tree="issues"] [data-batch="${batch!.id}"]`).click()
  return { batchId: batch!.id, issueIds: batch!.issues.map(issue => issue.id) }
}

function report(batchId: string, issueId: string, state: string, resultId: string) {
  return tool('report_result', { batch_id: batchId, issue_id: issueId, state, summary: 'Done', result_id: resultId })
}

/** Holds the page's status reads while `work` runs, so it sees all of it in one read. */
async function inOneRead(page: Page, work: () => Promise<void>) {
  let release = () => {}
  const gate = new Promise<void>(done => (release = done))
  await page.route('**/v1/status', async (route) => {
    await gate
    await route.continue()
  })
  await work()
  release()
}

const toast = (page: Page) => ui(page, '.toast')
const historyLines = (page: Page) => ui(page, '.inspector .history li .what > :first-child')
const row = (page: Page, id: string) => ui(page, `.inspector [data-tree="issues"] [data-sent-issue="${id}"]`)
const stateOf = (page: Page, id: string) => row(page, id).locator('.tree-state')

test('each sent issue says how far Claude has got', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first, second] } = await send(page, ['#clip', '#cancel'])
  await expect(stateOf(page, first!)).toHaveText('Waiting')
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await expect(stateOf(page, second!)).toHaveText('Claude has it')
  await tool('report_result', { batch_id: batchId, issue_id: first, state: 'needs-review', summary: 'Done', result_id: 'r1' })
  await expect(stateOf(page, first!)).toHaveText('Fixed: check it')
  await expect(stateOf(page, first!)).not.toHaveClass(/warn/)
  await tool('report_result', { batch_id: batchId, issue_id: second, state: 'blocked', summary: 'Which one?', result_id: 'r2' })
  await expect(stateOf(page, second!)).toHaveText('Blocked: see the terminal')
  await expect(stateOf(page, second!)).toHaveClass(/warn/)
  // What the agent wrote stays in its terminal.
  await expect(ui(page, '.inspector')).not.toContainText('Which one?')
})

test('a check pulses its target and says so', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  const line = ui(page, '.inspector .status.claude .said')
  await expect(line).toHaveText('Claude is on it')
  await tool('check_issue', { batch_id: batchId, issue_id: first })
  const pulse = ui(page, '.guides .box.pulse')
  await expect(pulse).toHaveCount(1)
  const target = (await page.locator('#cancel').boundingBox())!
  // The rect's own geometry: a bounding box would include the stroke.
  const box = await pulse.evaluate(el => Object.fromEntries(['x', 'y', 'width', 'height'].map(side => [side, Number(el.getAttribute(side))])))
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(box[side]! - target[side])).toBeLessThanOrEqual(1)
  await expect(line).toHaveText('Claude is checking issue 1')
  await expect(pulse).toHaveCount(0, { timeout: 6000 })
  await expect(line).toHaveText('Claude is on it')
})

test('a fixed issue raises a toast whose Show on page scrolls to it', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px'
    window.scrollTo(0, 2500)
  })
  await report(batchId, first!, 'needs-review', 'r1')
  await expect(toast(page)).toContainText('Claude fixed issue 1: check it')
  await toast(page).getByRole('button', { name: 'Show on page' }).click()
  await expect.poll(async () => {
    const box = (await page.locator('#cancel').boundingBox())!
    return box.y >= 0 && box.y + box.height <= page.viewportSize()!.height
  }).toBe(true)
  await expect(toast(page)).toHaveCount(0)
})

test('several results at once make one toast', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds } = await send(page, ['#clip', '#cancel', '#submit'])
  await tool('next_work')
  await expect(stateOf(page, issueIds[0]!)).toHaveText('Claude has it')
  await inOneRead(page, async () => {
    for (const [i, id] of issueIds.entries()) await report(batchId, id, 'needs-review', `r${i}`)
  })
  await expect(toast(page)).toContainText('Claude finished 3 issues')
  await expect(toast(page).getByRole('button')).toHaveCount(0)
  for (const id of issueIds) await expect(stateOf(page, id)).toHaveText('Fixed: check it')
})

test('a result for a target elsewhere has no Show on page', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await page.evaluate(() => document.getElementById('cancel')?.remove())
  await report(batchId, first!, 'needs-review', 'r1')
  await expect(toast(page)).toContainText('Claude fixed issue 1: check it')
  await expect(toast(page).getByRole('button')).toHaveCount(0)
})

test('a reload repeats nothing', async ({ page }) => {
  await mount(page, 'auto')
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await report(batchId, first!, 'blocked', 'r1')
  await expect(toast(page)).toContainText('Claude is blocked on issue 1: see the terminal')
  await expect(toast(page).locator('.warn')).toHaveCount(1)
  await mount(page, 'auto')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, `.inspector [data-tree="issues"] [data-batch="${batchId}"]`).click()
  // The status is read, and nothing it says is news.
  await expect(stateOf(page, first!)).toHaveText('Blocked: see the terminal')
  await expect(toast(page)).toHaveCount(0)
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).filter({ hasText: /^Claude/ })).toHaveText([
    'Claude marked issue 1 blocked',
    'Claude took the report',
  ])
})

test('with the agent\'s status off nothing is shown', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await page.evaluate(() => window.sg!.update({ agentStatus: false }))
  await expect(stateOf(page, first!)).toHaveCount(0)
  let reads = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/v1/status')) reads++
  })
  await tool('check_issue', { batch_id: batchId, issue_id: first })
  await expect(ui(page, '.guides .box.pulse')).toHaveCount(0)
  await expect(ui(page, '.inspector .status.claude')).not.toContainText('checking')
  const seen = page.waitForResponse(res => res.url().includes('/v1/page/next'))
  await report(batchId, first!, 'needs-review', 'r1')
  await seen
  expect(reads).toBe(0)
  // On again, the rows catch up at once; what happened meanwhile raises no toast and no History line.
  await page.evaluate(() => window.sg!.update({ agentStatus: true }))
  await expect(stateOf(page, first!)).toHaveText('Fixed: check it', { timeout: 2000 })
  await expect(toast(page)).not.toContainText('Claude fixed')
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).filter({ hasText: /^Claude/ })).toHaveText(['Claude took the report'])
})

test('results that came while the overlay was folded are in History, without a toast', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await ui(page, '.dock .toggle').click()
  await expect(ui(page, '.inspector')).toHaveCount(0)
  await report(batchId, first!, 'needs-review', 'r1')
  // Unfolded, the drawer comes back at the Issues tab it showed.
  await ui(page, '.dock .toggle').click()
  await expect(stateOf(page, first!)).toHaveText('Fixed: check it')
  await expect(toast(page)).not.toContainText('Claude fixed')
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).first()).toHaveText('Claude marked issue 1 fixed')
})

test('a check on a report another window sent is not in this window\'s History', async ({ page, context }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  const other = await context.newPage()
  await mount(other)
  await tool('next_work')
  await tool('check_issue', { batch_id: batchId, issue_id: first })
  for (const [view, lines] of [[page, 1], [other, 0]] as const) {
    if (await ui(view, '.inspector').count() === 0) await ui(view, '.dock [aria-label^="Issues"]').click()
    await ui(view, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
    await expect(ui(view, '.inspector')).toBeVisible()
    await expect(historyLines(view).filter({ hasText: 'Claude checked issue 1' })).toHaveCount(lines)
  }
})

test('History lists what Claude did', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await tool('check_issue', { batch_id: batchId, issue_id: first })
  await report(batchId, first!, 'needs-review', 'r1')
  await expect(stateOf(page, first!)).toHaveText('Fixed: check it')
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).nth(0)).toHaveText('Claude marked issue 1 fixed')
  await expect(historyLines(page).nth(1)).toHaveText('Claude checked issue 1')
  await expect(historyLines(page).nth(2)).toHaveText('Claude took the report')
  await expect(historyLines(page).nth(3)).toHaveText('Made the report available to agents')
})

test('three results at once leave three History lines', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds } = await send(page, ['#clip', '#cancel', '#submit'])
  await tool('next_work')
  await expect(stateOf(page, issueIds[0]!)).toHaveText('Claude has it')
  await inOneRead(page, async () => {
    await report(batchId, issueIds[0]!, 'needs-review', 'r0')
    await report(batchId, issueIds[1]!, 'partial', 'r1')
    await report(batchId, issueIds[2]!, 'blocked', 'r2')
  })
  await expect(toast(page)).toContainText('Claude finished 3 issues')
  // One of them is blocked: the toast says so in the warning colour.
  await expect(toast(page).locator('.warn')).toHaveCount(1)
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).nth(0)).toHaveText('Claude marked issue 3 blocked')
  await expect(historyLines(page).nth(1)).toHaveText('Claude marked issue 2 partly fixed')
  await expect(historyLines(page).nth(2)).toHaveText('Claude marked issue 1 fixed')
})

test('a status read that answers after a newer one changes nothing', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first, second, third] } = await send(page, ['#clip', '#cancel', '#submit'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  // The read after the first result is held back until a later read has answered.
  const late: (() => Promise<void>)[] = []
  await page.route('**/v1/status', async (route) => {
    const response = await route.fetch()
    if (late.length) return route.fulfill({ response })
    late.push(() => route.fulfill({ response }))
  })
  await report(batchId, first!, 'needs-review', 'r1')
  await expect.poll(() => late.length).toBe(1)
  await report(batchId, second!, 'needs-review', 'r2')
  await expect(stateOf(page, second!)).toHaveText('Fixed: check it')
  await late[0]!()
  await report(batchId, third!, 'blocked', 'r3')
  await expect(toast(page)).toContainText('Claude is blocked on issue 3: see the terminal')
  await expect(stateOf(page, second!)).toHaveText('Fixed: check it')
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page)).toHaveText([
    'Claude marked issue 3 blocked',
    'Claude marked issue 2 fixed',
    'Claude marked issue 1 fixed',
    'Claude took the report',
    'Made the report available to agents',
    'Sent a report with 3 issues',
    /^Added 3/, /^Added 2/, /^Added 1/,
  ])
})

test('two windows of the app record each of Claude\'s steps once', async ({ page, context }) => {
  await mount(page, 'auto')
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  const other = await context.newPage()
  await mount(other, 'auto')
  await ui(other, '.dock [aria-label^="Issues"]').click()
  await ui(other, `.inspector [data-tree="issues"] [data-batch="${batchId}"]`).click()
  await expect(stateOf(other, first!)).toHaveText('Waiting')
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await expect(stateOf(other, first!)).toHaveText('Claude has it')
  await report(batchId, first!, 'needs-review', 'r1')
  await expect(stateOf(page, first!)).toHaveText('Fixed: check it')
  await expect(stateOf(other, first!)).toHaveText('Fixed: check it')
  await other.close()
  await mount(page, 'auto')
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await expect(historyLines(page).filter({ hasText: /^Claude/ })).toHaveText([
    'Claude marked issue 1 fixed',
    'Claude took the report',
  ])
})

test('Show on page marks a target that is already in view', async ({ page }) => {
  await mount(page)
  const { batchId, issueIds: [first] } = await send(page, ['#cancel'])
  await tool('next_work')
  await expect(stateOf(page, first!)).toHaveText('Claude has it')
  await report(batchId, first!, 'needs-review', 'r1')
  await toast(page).getByRole('button', { name: 'Show on page' }).click()
  const pulse = ui(page, '.guides .box.pulse')
  await expect(pulse).toHaveCount(1)
  const target = (await page.locator('#cancel').boundingBox())!
  const box = await pulse.evaluate(el => Object.fromEntries(['x', 'y', 'width', 'height'].map(side => [side, Number(el.getAttribute(side))])))
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(box[side]! - target[side])).toBeLessThanOrEqual(1)
  // Not a check: the line above Send stays as it was.
  await expect(ui(page, '.inspector .status.claude')).not.toContainText('checking')
})
