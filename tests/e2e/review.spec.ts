// tests/e2e/review.spec.ts
// The overlay -> local bridge -> MCP client loop. What the agent says back is read in its terminal, not on the page.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, test, type Page } from '@playwright/test'
import { startBroker, type Broker } from '../../src/bridge/server'
import { pick, preset, ui } from './helpers'

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

test('issues sent to the bridge reach the agent; what it says back stays out of the page', async ({ page, browserName }) => {
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
  // Reached directly, the line names no app; the bridge answers, so it is not out of reach.
  await expect(ui(page, '.inspector .status.claude')).not.toHaveAttribute('data-state', 'unlinked')
  await expect(ui(page, '.inspector .status.claude .via')).toHaveCount(0)
  await ui(page, '.inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  await expect(ui(page, '.toast')).toContainText('/smegglect')

  const list = JSON.parse((await tool('list_batches')).text)
  expect(list).toHaveLength(1)
  const batchId = list[0].id as string
  const [clip, match] = list[0].issues as { id: string }[]
  const summary = JSON.parse((await tool('get_batch', { batch_id: batchId })).text)
  expect(summary.issues[1].task).toContain('Make the height of A match the height of B')
  expect(summary.issues[1].b.element.label).toBe('Save order')

  // The agent's results are recorded for its own queue; the page shows none of them.
  await tool('report_result', { batch_id: batchId, issue_id: clip!.id, state: 'needs-review', summary: 'Added a tooltip with the full text', result_id: 'c1' })
  await tool('report_result', { batch_id: batchId, issue_id: match!.id, state: 'blocked', summary: 'Which height?', result_id: 'm1' })
  expect(JSON.parse((await tool('list_batches')).text)[0].issues.map((i: { state: string }) => i.state)).toEqual(['needs-review', 'blocked'])
  expect(JSON.parse((await tool('next_work')).text).open).toEqual([])
  await ui(page, `.inspector [data-tree="issues"] [data-batch="${batchId}"]`).click()
  const row = (id: string) => ui(page, `.inspector [data-tree="issues"] [data-sent-issue="${id}"]`)
  await expect(row(match!.id).locator('.tree-meta')).toHaveText('button "Cancel"')
  await row(match!.id).click()
  await expect(ui(page, '.inspector .issue-view')).not.toContainText('Which height?')
  await expect(ui(page, '.inspector .issue-view')).not.toContainText('Accept')
  await ui(page, '.inspector .issue-view [aria-label="Back"]').click()
  await expect(ui(page, '.toast')).not.toContainText('to check')

  // The target of the first issue disappears: its row says so, the evidence stays.
  await page.evaluate(() => document.getElementById('clip')?.remove())
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'History' }).click()
  await ui(page, '.inspector .tabstrip button').filter({ hasText: 'Issues' }).click()
  await expect(row(clip!.id)).toHaveClass(/warn/)
  await expect(row(clip!.id)).toContainText('Target not found on this page')
  const evidence = await tool('get_issue_evidence', { batch_id: batchId, issue_id: clip!.id })
  expect(JSON.parse(evidence.text).issue.operands.a.element.tag).toBe('p')
})

/** Long-polls of the page channel that are still open. */
async function polls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { openPolls: number }).openPolls)
}

test('the page re-measures an issue for the agent and tells it the selection', async ({ page, browserName }) => {
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
  await ui(page, '.inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  // The work list and the report rows are read once the broker has the batch.
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  const work = JSON.parse((await tool('next_work')).text).open as { batch_id: string, issue_id: string }[]
  expect(work).toHaveLength(1)
  const { batch_id: batchId, issue_id: issueId } = work[0]!

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
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Heights matched', result_id: 'live1' })

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

test('a desktop app reaches the bridge through its own call instead of fetch, and the loop works through it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  const origin = new URL(test.info().project.use.baseURL!).origin
  // What the app's native side does: forward to the broker with the token, which the page never sees.
  await page.exposeFunction('bridgeCall', async (r: { method: string, path: string, body?: string, type?: string, base64?: boolean }) => {
    const body = r.body === undefined ? undefined : r.base64 ? Buffer.from(r.body, 'base64') : r.body
    const res = await fetch(`${broker.url}${r.path}`, { method: r.method, headers: { authorization: `Bearer ${broker.token}`, origin, ...(r.type ? { 'content-type': r.type } : {}) }, ...(body === undefined ? {} : { body }) })
    return { status: res.status, body: await res.text() }
  })
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(() => {
    const call = (window as unknown as { bridgeCall: (r: unknown) => Promise<{ status: number, body: string }> }).bridgeCall
    window.sg = window.smegglect.mount({
      project: { id: 'review' }, open: true, storage: 'memory',
      bridge: { label: 'Desk', via: (request, signal) => new Promise((done, fail) => {
        call(request).then(done, fail)
        signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')), { once: true })
      }) },
    })
  })
  await pick(page, '#cancel')
  await preset(page, 'note', { note: 'Through the app' })
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await expect(ui(page, '.inspector .status.claude .via')).toHaveText('via Desk')
  await ui(page, '.inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  // The send goes through the app's call; the work list is read once the broker has the batch.
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  const open = JSON.parse((await tool('next_work')).text).open as { batch_id: string, issue_id: string }[]
  expect(open).toHaveLength(1)
  const { batch_id: batchId, issue_id: issueId } = open[0]!
  expect(JSON.parse((await tool('check_issue', { batch_id: batchId, issue_id: issueId })).text)).toMatchObject({ status: 'live' })
  await tool('report_result', { batch_id: batchId, issue_id: issueId, state: 'needs-review', summary: 'Done through the app', result_id: 'desk1' })
  expect(JSON.parse((await tool('list_batches')).text).find((b: { id: string }) => b.id === batchId).issues[0].state).toBe('needs-review')
})

test('after Send the page says whether an agent has the report, in its own words only', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
  await page.goto('/plain.html?manual')
  await page.waitForFunction(() => !!window.smegglect)
  await page.evaluate(({ url, token }) => {
    window.sg = window.smegglect.mount({ project: { id: 'status' }, open: true, storage: 'memory', bridge: { url, token } })
  }, { url: broker.url, token: broker.token })
  await pick(page, '#cancel')
  await preset(page, 'note', { note: 'Status words only' })
  await ui(page, '.dock [aria-label^="Issues"]').click()
  await ui(page, '.inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  // The work list and the report rows are read once the broker has the batch.
  await expect(ui(page, '.toast')).toContainText('Available to agents as bat_')
  const sentId = await page.evaluate(() => window.sg!.engine.session.store.get().submitted[0]!.id)
  const report = ui(page, `.inspector [data-tree="issues"] [data-batch="${sentId}"] .tree-meta`)
  await expect(report).toHaveText('Waiting for an agent')

  // The agent's one call: the work list. Its client calls itself review-test; the page names no client.
  const open = JSON.parse((await tool('next_work')).text).open as { batch_id: string, issue_id: string }[]
  const mine = open.find(item => item.batch_id === sentId)!
  await expect(report).toHaveText('An agent has it')
  // It has the report and is not listening: it is working on it, not gone.
  await expect(ui(page, '.inspector .status.claude')).toHaveText('The agent is on it')
  await expect(ui(page, '.inspector .status.claude')).toHaveAttribute('data-state', 'working')

  await tool('report_result', {
    batch_id: mine.batch_id,
    issue_id: mine.issue_id,
    state: 'needs-review',
    summary: 'AGENT-WROTE-THIS',
    files: ['AGENT/FILE.vue'],
    checks: [{ command: 'AGENT-CMD', outcome: 'passed' }],
  })
  await expect(report).toHaveText('Done, see the agent\'s terminal')
  const text = await page.evaluate(() => {
    const root = document.querySelector('smegglect-root')!.shadowRoot!
    return [...root.querySelectorAll('*')].map(el => `${el.textContent} ${[...el.attributes].map(a => a.value).join(' ')}`).join('\n')
  })
  for (const written of ['AGENT-WROTE-THIS', 'AGENT/FILE.vue', 'AGENT-CMD', 'review-test']) expect(text).not.toContain(written)

  // Off in Settings: no words about the agent at all.
  await ui(page, '.dock [data-tool="settings"]').click()
  await ui(page, '.inspector .settings .form-row').filter({ hasText: 'Show the agent\'s progress' }).locator('input').uncheck()
  await ui(page, '.dock [data-tool="issues"]').click()
  await expect(ui(page, '.inspector .status.claude')).toHaveText('Bridge connected')
  await expect(ui(page, '.inspector .status.claude')).toHaveAttribute('data-state', 'linked')
  await expect(report).toHaveCount(0)
})
