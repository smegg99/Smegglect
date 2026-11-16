// tests/fixtures/loop.spec.ts
// The agent loop in a consumer of the packed tarball: the page sends, a scripted agent takes the work list,
// asks the open page to check the issue and reports it, through the CLI the package installs.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'
import type { Smegglect } from '../../src/overlay/index'

const run = promisify(execFile)

interface Consumer {
  name: string
  url: string
  folder: string
  target: string
}

const CONSUMERS: Consumer[] = [
  { name: 'Vite', url: 'http://127.0.0.1:5201/', folder: 'fixtures/vite-vue', target: '.task >> nth=1 >> .done' },
  { name: 'Nuxt', url: 'http://127.0.0.1:5213/', folder: 'fixtures/nuxt', target: '.book >> nth=1' },
]

/** One scripted agent: the installed CLI run in the consumer's folder, as an agent without MCP would. */
function agent(folder: string, id: string) {
  return async (...args: string[]) => {
    const cli = 'node_modules/smegglect/dist/bridge-cli.js'
    const env = { ...process.env, SMEGGLECT_AGENT: id }
    const { stdout } = await run(process.execPath, [cli, ...args], { cwd: folder, env })
    return stdout.trim()
  }
}

async function sendOneIssue(page: Page, target: string): Promise<string> {
  await page.evaluate(() => {
    const instances = (globalThis as unknown as Record<symbol, Map<string, Smegglect>>)[Symbol.for('smegglect.instances')]
    instances?.get('default')?.engine.setExpanded(true)
  })
  await page.locator('smegglect-root .dock [aria-label="Pick element"]').click()
  await page.locator(target).click()
  await page.locator('smegglect-root .inspector [data-tree="actions"] [data-preset="clipped"]').click()
  await page.locator('smegglect-root .inspector .compose .add').click()
  await page.locator('smegglect-root .dock [aria-label^="Issues"]').click()
  await page.locator('smegglect-root .inspector .foot button').filter({ hasText: 'Send to Claude' }).click()
  const toast = page.locator('smegglect-root .toast')
  await expect(toast).toContainText('Available to agents as bat_')
  return /bat_[\w-]+/.exec(await toast.innerText())?.[0] ?? ''
}

for (const consumer of CONSUMERS) {
  test(`${consumer.name}: send, work list, check on the open page, report`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one browser drives the shared broker')
    await page.goto(consumer.url)
    await page.waitForSelector('smegglect-root', { state: 'attached', timeout: 30_000 })
    const batchId = await sendOneIssue(page, consumer.target)
    expect(batchId).toMatch(/^bat_/)
    const cli = agent(consumer.folder, `fixture_${browserName}_${Date.now()}`)

    // Earlier runs may have left issues; this test answers only its own batch.
    const work = JSON.parse(await cli('work')) as { open: { batch_id: string, issue_id: string }[] }
    const mine = work.open.filter(item => item.batch_id === batchId)
    expect(mine).toHaveLength(1)
    const issueId = mine[0]!.issue_id

    const check = JSON.parse(await cli('check', batchId, issueId))
    expect(check).toMatchObject({ status: 'live', answeredBy: { sentTheBatch: true } })
    expect(await cli('report', batchId, issueId, '--state', 'needs-review')).toMatch(/^recorded res_\w+ as needs-review$/)

    const after = JSON.parse(await cli('work', '--no-claim')) as { open: { batch_id: string }[] }
    expect(after.open.filter(item => item.batch_id === batchId)).toEqual([])
    const row = page.locator(`smegglect-root .inspector [data-tree="issues"] [data-batch="${batchId}"]`)
    await expect(row).toContainText('Done, see the agent\'s terminal')
  })
}
