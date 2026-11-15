// tests/bridge/answers.test.ts
// Tool answers: one call to start, one spelling of ids, no batch nobody asked for, no prose nobody reads.
import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch, type Issue } from '../../src/core/model'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'
const brokers: Broker[] = []
const clients: Client[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  await Promise.all(brokers.splice(0).map(broker => broker.close()))
})

function batch(issues: number, over: Partial<Issue>): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_ans1', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-15T00:00:00Z', submittedAt: '2026-11-15T01:00:00Z',
    provider: { branch: 'main' },
    issues: Array.from({ length: issues }, (_, i) => issue({ id: `iss_n${i + 1}`, seq: i + 1, status: 'submitted', ...over })),
    attachments: [],
  }
}

/** A broker holding one batch sent from a page, an MCP client on it, and a page that answers checks. */
async function setUp(issues: number, over: Partial<Issue> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sg-ans-'))
  const broker = await startBroker({ root, origins: [ORIGIN], log: () => {} })
  brokers.push(broker)
  const asPage = (path: string, body?: unknown) => fetch(`${broker.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'authorization': `Bearer ${broker.token}`, 'origin': ORIGIN, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  expect((await asPage('/v1/batches', batch(issues, over))).status).toBe(201)
  const client = new Client({ name: 'answers-test', version: '1' })
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ['dist/bridge-cli.js', 'mcp', '--root', root],
    stderr: 'ignore',
  }))
  clients.push(client)
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args }) as { content: { text: string }[], isError?: boolean }
    return { text: res.content[0]?.text ?? '', isError: !!res.isError }
  }
  let stop = false
  void (async () => {
    let after = (await (await asPage('/v1/page/next?page=win_test')).json() as { seq: number }).seq
    while (!stop) {
      const polled = await (await asPage(`/v1/page/next?page=win_test&after=${after}&wait=2`)).json() as {
        seq: number
        events: { kind: string, id: string }[]
      }
      after = polled.seq
      for (const event of polled.events) {
        if (event.kind === 'check') await asPage(`/v1/checks/${event.id}?page=win_test`, { status: 'live', changes: [] })
      }
    }
  })().catch(() => {})
  return { root, tool, stopPage: () => (stop = true) }
}

const cli = (...args: string[]) => new Promise<string>((done) => {
  execFile(process.execPath, ['dist/bridge-cli.js', ...args], (_error, stdout, stderr) => done(stdout + stderr))
})

describe('tool answers', () => {
  it('starts from the work list alone and ends with a state alone', async () => {
    const { tool, stopPage } = await setUp(1)
    stopPage()
    const work = JSON.parse((await tool('next_work')).text)
    expect(work.note).toMatch(/untrusted/)
    const [item] = work.open
    expect(item).toMatchObject({
      batch_id: 'bat_ans1',
      issue_id: 'iss_n1',
      seq: 1,
      scope: 'occurrence',
      viewport: { width: 100, height: 100 },
      colorScheme: 'light',
    })
    expect(item.task).toContain('Make the height of A match the height of B')
    expect(item.target).toContain('button')
    expect(item.contents).toBeNull()
    expect(typeof item.note).toBe('string')
    const report = await tool('report_result', { batch_id: item.batch_id, issue_id: item.issue_id, state: 'needs-review' })
    expect(report).toEqual({ text: expect.stringMatching(/^recorded res_\w+ as needs-review$/), isError: false })
    expect(JSON.parse((await tool('next_work')).text).open).toEqual([])
  })

  it('never spells the ids batchId or issueId, in a tool or a command', async () => {
    const { root, tool, stopPage } = await setUp(2)
    await new Promise(done => setTimeout(done, 100))
    const answers = [
      (await tool('next_work')).text,
      (await tool('list_batches')).text,
      (await tool('get_batch', { batch_id: 'bat_ans1' })).text,
      (await tool('get_issue_evidence', { batch_id: 'bat_ans1', issue_id: 'iss_n1' })).text,
      (await tool('check_issue', { batch_id: 'bat_ans1', issue_id: 'iss_n1' })).text,
      (await tool('report_result', { batch_id: 'bat_ans1', issue_id: 'iss_n1', state: 'partial', summary: 'half' })).text,
      (await tool('get_issue_evidence', { batch_id: 'bat_ans1', issue_id: 'iss_n1' })).text,
      await cli('work', '--root', root),
      await cli('batches', '--root', root),
      await cli('batch', 'bat_ans1', '--root', root),
      await cli('evidence', 'bat_ans1', 'iss_n1', '--root', root),
      await cli('check', 'bat_ans1', 'iss_n2', '--root', root),
      await cli('report', 'bat_ans1', 'iss_n2', '--state', 'blocked', '--root', root),
    ]
    stopPage()
    for (const answer of answers) {
      expect(answer).not.toMatch(/batchId|issueId/)
    }
  })

  it("names the files of a region's elements in the work list, and gives the elements in its evidence", async () => {
    const base = issue()
    const listed = (component: string, file?: string) => ({
      element: { tag: 'div', classes: [], path: [], shadowDepth: 0 },
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      source: file
        ? { quality: 'exact', provenance: 'vite-transform', file, line: 3, component }
        : { quality: 'component', provenance: 'vue-instance', component },
    })
    const elements = [listed('A', 'src/A.vue'), listed('A', 'src/A.vue'), listed('B'), listed('C', 'src/C.vue')]
    const { tool, stopPage } = await setUp(1, {
      intent: { ...base.intent, preset: { id: 'note', version: 1 }, params: {}, note: 'These' },
      operands: { a: { kind: 'region', rect: { x: 0, y: 0, width: 50, height: 50 }, frame: 'document', boundary: 'manual' } },
      evidence: { ...base.evidence, b: undefined, a: { ...base.evidence.a, contents: { mode: 'touching', elements, total: 9 } } },
    } as Partial<Issue>)
    stopPage()
    const [item] = JSON.parse((await tool('next_work')).text).open
    expect(item.contents).toEqual({ mode: 'touching', files: ['src/A.vue', 'src/C.vue'], total: 9 })
    const evidence = (await tool('get_issue_evidence', { batch_id: 'bat_ans1', issue_id: 'iss_n1' })).text
    expect(evidence).toContain('src/C.vue')
  })

  it('gives one issue\'s evidence without the other issues of its batch', async () => {
    const { tool, stopPage } = await setUp(3)
    stopPage()
    const evidence = JSON.parse((await tool('get_issue_evidence', { batch_id: 'bat_ans1', issue_id: 'iss_n2' })).text)
    const text = JSON.stringify(evidence)
    expect(text).toContain('iss_n2')
    expect(text).not.toContain('iss_n1')
    expect(text).not.toContain('iss_n3')
    expect(evidence.batch).toEqual({
      id: 'bat_ans1',
      project: { id: 'demo' },
      provider: { branch: 'main' },
      submittedAt: '2026-11-15T01:00:00Z',
    })
  })
})
