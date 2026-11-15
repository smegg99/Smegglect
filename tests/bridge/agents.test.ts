// tests/bridge/agents.test.ts
// Agent status from calls agents make anyway: listening, a batch taken, claims that two agents never share.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../../src/core/model'
import { createAgents, issueKey } from '../../src/bridge/agents'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'
const brokers: Broker[] = []
afterEach(async () => {
  await Promise.all(brokers.splice(0).map(broker => broker.close()))
})

function batch(): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_agent1', project: { id: 'demo' }, window: { id: 'win_page' },
    status: 'submitted', createdAt: '2026-11-15T00:00:00Z', submittedAt: '2026-11-15T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' }), issue({ id: 'iss_two', seq: 2, status: 'submitted' })],
    attachments: [],
  }
}

async function setUp(agentTimeoutMs?: number, root = mkdtempSync(join(tmpdir(), 'sg-agents-'))) {
  const broker = await startBroker({ root, origins: [ORIGIN], log: () => {}, agentTimeoutMs })
  brokers.push(broker)
  const asPage = (path: string, body?: unknown) => fetch(`${broker.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'authorization': `Bearer ${broker.token}`, 'origin': ORIGIN, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(res => res.json())
  const asAgent = (id: string, path: string, client = 'claude-code') => fetch(`${broker.url}${path}`, {
    headers: { 'authorization': `Bearer ${broker.token}`, 'x-smegglect-agent': id, 'x-smegglect-client': client },
  }).then(res => res.json())
  return { root, broker, asPage, asAgent }
}

const issueIds = (answer: { open: { issue_id: string }[] }) => answer.open.map(item => item.issue_id)

describe('agent status', () => {
  it('shows listening while wait holds, then the batch taken after the work list alone, then done', async () => {
    const { root, broker, asPage, asAgent } = await setUp()
    // Run by hand, not by Claude Code: the command names no Claude.
    const env = { ...process.env, CLAUDECODE: '' }
    const waiting = spawn(process.execPath, ['dist/bridge-cli.js', 'wait', '--root', root], { stdio: 'ignore', env })
    const exited = new Promise(done => waiting.on('exit', done))
    try {
      await expect.poll(async () => (await asPage('/v1/status')).agent.listening).toBe(true)
      expect((await asPage('/v1/status')).agent.kind).toBe('other')
      await asPage('/v1/batches', batch())
      await exited
      expect((await asPage('/v1/status')).batches).toEqual({ bat_agent1: 'waiting' })

      // The agent's one call: the work list.
      const work = await asAgent('mcp_a', '/v1/work')
      expect(issueIds(work)).toEqual(['iss_one', 'iss_two'])
      expect(work.link).toMatchObject({ senderOpen: { bat_agent1: false }, pages: [] })
      expect(typeof work.link.broker).toBe('string')
      const status = await asPage('/v1/status')
      expect(status.batches).toEqual({ bat_agent1: 'taken' })
      expect(status.agent).toMatchObject({ listening: false, kind: 'claude' })

      for (const issueId of ['iss_one', 'iss_two']) {
        await fetch(`${broker.url}/v1/batches/bat_agent1/followups`, {
          method: 'POST',
          headers: { 'authorization': `Bearer ${broker.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            id: `res_${issueId}`, batchId: 'bat_agent1', issueId, kind: 'result', actor: 'agent',
            state: 'needs-review', text: '', createdAt: '2026-11-15T02:00:00Z',
          }),
        })
      }
      expect((await asPage('/v1/status')).batches).toEqual({ bat_agent1: 'done' })
    }
    finally {
      waiting.kill()
    }
  })

  it('names Claude when Claude Code runs the command', async () => {
    const { root, asPage } = await setUp()
    const env = { ...process.env, CLAUDECODE: '1' }
    const waiting = spawn(process.execPath, ['dist/bridge-cli.js', 'wait', '--root', root], { stdio: 'ignore', env })
    try {
      await expect.poll(async () => (await asPage('/v1/status')).agent.kind).toBe('claude')
    }
    finally {
      waiting.kill()
    }
  })

  it('never gives two agents the same issue; a quiet agent\'s issues come back, and look leaves them', async () => {
    const { asPage, asAgent } = await setUp(400)
    await asPage('/v1/batches', batch())
    expect(issueIds(await asAgent('mcp_a', '/v1/work'))).toEqual(['iss_one', 'iss_two'])
    expect(issueIds(await asAgent('mcp_b', '/v1/work'))).toEqual([])
    // A look with claim=false takes nothing.
    await new Promise(done => setTimeout(done, 500))
    expect(issueIds(await asAgent('mcp_b', '/v1/work?claim=false'))).toEqual(['iss_one', 'iss_two'])
    expect(issueIds(await asAgent('mcp_c', '/v1/work'))).toEqual(['iss_one', 'iss_two'])
    expect(issueIds(await asAgent('mcp_b', '/v1/work'))).toEqual([])
    expect((await asPage('/v1/status')).batches).toEqual({ bat_agent1: 'taken' })
    await new Promise(done => setTimeout(done, 500))
    expect((await asPage('/v1/status')).batches).toEqual({ bat_agent1: 'stalled' })
  })

  it('an issue marked in progress stays with its agent, and returns when that agent goes quiet', async () => {
    const { broker, asPage, asAgent } = await setUp(400)
    await asPage('/v1/batches', batch())
    expect(issueIds(await asAgent('mcp_a', '/v1/work'))).toEqual(['iss_one', 'iss_two'])
    await fetch(`${broker.url}/v1/batches/bat_agent1/followups`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${broker.token}`, 'content-type': 'application/json', 'x-smegglect-agent': 'mcp_a',
      },
      body: JSON.stringify({
        id: 'res_begun', batchId: 'bat_agent1', issueId: 'iss_one', kind: 'result', actor: 'agent',
        state: 'in-progress', text: '', createdAt: '2026-11-15T02:00:00Z',
      }),
    })
    // Its own agent is not given it again, and no other agent gets it while that agent lives.
    expect(issueIds(await asAgent('mcp_a', '/v1/work?claim=false'))).toEqual(['iss_two'])
    expect(issueIds(await asAgent('mcp_b', '/v1/work?claim=false'))).toEqual([])
    await new Promise(done => setTimeout(done, 500))
    const work = await asAgent('mcp_b', '/v1/work')
    expect(issueIds(work)).toEqual(['iss_one', 'iss_two'])
    expect(work.open[0].state).toBe('in-progress')
    expect(issueIds(await asAgent('mcp_c', '/v1/work'))).toEqual([])
  })

  it('each sent issue has its own progress', async () => {
    const { broker, asPage, asAgent } = await setUp(300)
    await asPage('/v1/batches', batch())
    const issues = async () => (await asPage('/v1/status')).issues.bat_agent1
    const result = (issueId: string, state: string, at: string) => fetch(`${broker.url}/v1/batches/bat_agent1/followups`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${broker.token}`, 'content-type': 'application/json', 'x-smegglect-agent': 'mcp_a',
      },
      body: JSON.stringify({
        id: `res_${state.replace('-', '')}`, batchId: 'bat_agent1', issueId, kind: 'result', actor: 'agent',
        state, text: '', createdAt: at,
      }),
    })
    expect(await issues()).toEqual({ iss_one: 'waiting', iss_two: 'waiting' })
    await asAgent('mcp_a', '/v1/work')
    expect(await issues()).toEqual({ iss_one: 'taken', iss_two: 'taken' })
    await result('iss_one', 'in-progress', '2026-11-15T02:00:00Z')
    expect(await issues()).toEqual({ iss_one: 'in-progress', iss_two: 'taken' })
    await result('iss_one', 'needs-review', '2026-11-15T03:00:00Z')
    expect(await issues()).toEqual({ iss_one: 'needs-review', iss_two: 'taken' })
    await new Promise(done => setTimeout(done, 400))
    expect(await issues()).toEqual({ iss_one: 'needs-review', iss_two: 'stalled' })
  })

  it('an issue begun before the broker restarted stays in progress while its agent lives', async () => {
    const before = await setUp(300)
    await before.asPage('/v1/batches', batch())
    await before.asAgent('mcp_a', '/v1/work')
    await fetch(`${before.broker.url}/v1/batches/bat_agent1/followups`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${before.broker.token}`, 'content-type': 'application/json', 'x-smegglect-agent': 'mcp_a',
      },
      body: JSON.stringify({
        id: 'res_begun', batchId: 'bat_agent1', issueId: 'iss_one', kind: 'result', actor: 'agent',
        state: 'in-progress', text: '', createdAt: '2026-11-15T02:00:00Z',
      }),
    })
    await brokers.splice(brokers.indexOf(before.broker), 1)[0]!.close()
    // A new broker on the same folder knows the result, not who holds the issue; the agent only says hello.
    const after = await setUp(300, before.root)
    await fetch(`${after.broker.url}/v1/agents/hello`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${after.broker.token}`, 'content-type': 'application/json',
        'x-smegglect-agent': 'mcp_a', 'x-smegglect-client': 'claude-code',
      },
      body: '{}',
    })
    const issues = async () => (await after.asPage('/v1/status')).issues.bat_agent1
    expect(await issues()).toEqual({ iss_one: 'in-progress', iss_two: 'waiting' })
    await new Promise(done => setTimeout(done, 400))
    expect(await issues()).toEqual({ iss_one: 'stalled', iss_two: 'waiting' })
  })

  it('an issue begun by an agent that goes quiet stalls', async () => {
    const { broker, asPage, asAgent } = await setUp(300)
    await asPage('/v1/batches', batch())
    await asAgent('mcp_a', '/v1/work')
    await fetch(`${broker.url}/v1/batches/bat_agent1/followups`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${broker.token}`, 'content-type': 'application/json', 'x-smegglect-agent': 'mcp_a',
      },
      body: JSON.stringify({
        id: 'res_begun', batchId: 'bat_agent1', issueId: 'iss_one', kind: 'result', actor: 'agent',
        state: 'in-progress', text: '', createdAt: '2026-11-15T02:00:00Z',
      }),
    })
    expect((await asPage('/v1/status')).issues.bat_agent1.iss_one).toBe('in-progress')
    await new Promise(done => setTimeout(done, 400))
    expect((await asPage('/v1/status')).issues.bat_agent1.iss_one).toBe('stalled')
  })

  it('a killed MCP session\'s issues return to the queue for another after the timeout', async () => {
    const { root, asPage } = await setUp(1500)
    await asPage('/v1/batches', batch())
    const connect = async (name: string) => {
      const client = new Client({ name, version: '1' })
      await client.connect(new StdioClientTransport({
        command: process.execPath,
        args: ['dist/bridge-cli.js', 'mcp', '--root', root],
        stderr: 'ignore',
      }))
      return client
    }
    const work = async (client: Client) => {
      const res = await client.callTool({ name: 'next_work', arguments: {} }) as { content: { text: string }[] }
      return issueIds(JSON.parse(res.content[0]!.text))
    }
    const first = await connect('claude-code')
    const second = await connect('claude-code')
    try {
      expect(await work(first)).toEqual(['iss_one', 'iss_two'])
      expect(await work(second)).toEqual([])
      await first.close()
      await new Promise(done => setTimeout(done, 1700))
      expect(await work(second)).toEqual(['iss_one', 'iss_two'])
    }
    finally {
      await second.close()
    }
  }, 15_000)
})

describe('the agent tracker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says so when an agent takes issues it did not hold, and not when it takes them again', () => {
    let changes = 0
    const agents = createAgents(300, () => changes++)
    agents.seen({ id: 'mcp_a', kind: 'claude' })
    const before = changes
    agents.claim('mcp_a', [issueKey('bat_1', 'iss_1')])
    expect(changes).toBe(before + 1)
    agents.claim('mcp_a', [issueKey('bat_1', 'iss_1')])
    expect(changes).toBe(before + 1)
    agents.claim('mcp_b', [issueKey('bat_1', 'iss_1')])
    expect(changes).toBe(before + 2)
  })

  it('an agent forgotten after an hour leaves its issues waiting, whatever is asked first', () => {
    vi.useFakeTimers()
    const agents = createAgents(300, () => {})
    agents.seen({ id: 'mcp_a', kind: 'claude' })
    agents.claim('mcp_a', [issueKey('bat_1', 'iss_1')])
    agents.received('mcp_a', 'bat_1')
    vi.advanceTimersByTime(61 * 60_000)
    expect(agents.issueProgress('bat_1', 'iss_1', 'submitted')).toBe('waiting')
    expect(agents.progress('bat_1', false)).toBe('waiting')
  })
})
