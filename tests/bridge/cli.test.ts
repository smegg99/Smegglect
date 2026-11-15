// tests/bridge/cli.test.ts
// The agent's operations from a shell: a whole round through the built CLI, no MCP client.
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../../src/core/model'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'

const ORIGIN = 'http://127.0.0.1:5199'
const brokers: Broker[] = []

afterEach(async () => {
  await Promise.all(brokers.splice(0).map(broker => broker.close()))
})

interface Run {
  code: number
  stdout: string
  stderr: string
}

/** Runs the built CLI without blocking this process, which plays the open page meanwhile. */
function cli(...args: string[]): Promise<Run> {
  return new Promise((done) => {
    execFile(process.execPath, ['dist/bridge-cli.js', ...args], (error, stdout, stderr) => {
      done({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr })
    })
  })
}

function batch(): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_cli1', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-15T00:00:00Z', submittedAt: '2026-11-15T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' }), issue({ id: 'iss_two', seq: 2, status: 'submitted' })],
    attachments: [],
  }
}

interface Polled {
  seq: number
  events: { kind: string, id: string }[]
}

async function page(broker: Broker, path: string, body?: unknown): Promise<Polled> {
  const res = await fetch(`${broker.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'authorization': `Bearer ${broker.token}`,
      'origin': ORIGIN,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return { seq: 0, events: [] }
  return await res.json() as Polled
}

/** Answers every check while it runs, as an open page does. */
function openPage(broker: Broker): () => void {
  let stop = false
  void (async () => {
    let after = (await page(broker, '/v1/page/next?page=win_test')).seq
    while (!stop) {
      const res = await page(broker, `/v1/page/next?page=win_test&after=${after}&wait=2`)
      after = res.seq
      for (const event of res.events) {
        if (event.kind === 'check') await page(broker, `/v1/checks/${event.id}?page=win_test`, { status: 'live' })
      }
    }
  })().catch(() => {})
  return () => (stop = true)
}

describe('agent commands', () => {
  it('work, evidence, check and report go round from a shell', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-cli-'))
    const broker = await startBroker({ root, origins: [ORIGIN], log: () => {} })
    brokers.push(broker)
    await page(broker, '/v1/batches', batch())
    const stop = openPage(broker)
    try {
      const work = await cli('work', '--root', root)
      expect(work.code).toBe(0)
      expect(JSON.parse(work.stdout).open.map((item: { issue_id: string }) => item.issue_id)).toEqual(['iss_one', 'iss_two'])

      const evidence = await cli('evidence', 'bat_cli1', 'iss_one', '--root', root)
      expect(evidence.code).toBe(0)
      expect(JSON.parse(evidence.stdout)).toMatchObject({ issue: { id: 'iss_one' }, state: 'submitted' })

      await new Promise(done => setTimeout(done, 100))
      const check = await cli('check', 'bat_cli1', 'iss_one', '--root', root)
      expect(check.code).toBe(0)
      expect(JSON.parse(check.stdout)).toMatchObject({ status: 'live' })

      const report = await cli(
        'report', 'bat_cli1', 'iss_one', '--state', 'needs-review', '--summary', 'Widened the label',
        '--file', 'src/List.vue', '--check', 'bun run test=passed', '--result-id', 'cli1', '--root', root,
      )
      expect(report).toMatchObject({ code: 0, stdout: 'recorded res_cli1 as needs-review\n' })
      const stored = JSON.parse(readFileSync(join(root, '.smegglect/batches/bat_cli1/followups/res_cli1.json'), 'utf8'))
      expect(stored).toMatchObject({ checks: [{ command: 'bun run test', outcome: 'passed' }], files: ['src/List.vue'] })

      const after = await cli('work', '--root', root)
      expect(JSON.parse(after.stdout).open.map((item: { issue_id: string }) => item.issue_id)).toEqual(['iss_two'])
    }
    finally {
      stop()
    }
  })

  it('refuses with exit code 1 and the reason on stderr', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-cli-'))
    const closed = await cli('work', '--root', root)
    expect(closed.code).toBe(1)
    expect(closed.stdout).toBe('')
    expect(closed.stderr).toContain(`not running for ${root} (no ${join(root, '.smegglect', 'bridge.json')})`)

    const broker = await startBroker({ root, origins: [ORIGIN], log: () => {} })
    brokers.push(broker)
    const missing = await cli('evidence', 'bat_none', 'iss_none', '--root', root)
    expect(missing).toMatchObject({ code: 1, stderr: 'no issue iss_none in batch bat_none\n' })
    const badState = await cli('report', 'bat_none', 'iss_none', '--state', 'accepted', '--summary', 'x', '--root', root)
    expect(badState.code).toBe(1)
    expect(badState.stderr).toMatch(/^not recorded: state must be one of in-progress, partial, blocked, needs-review/)
    expect((await cli('evidence', 'bat_none', '--root', root)).code).toBe(2)
  })

  it('lists the commands on help', async () => {
    const help = await cli('help')
    expect(help.code).toBe(0)
    for (const command of ['work', 'batch <batch>', 'evidence <batch> <issue>', 'check <batch> <issue>', 'selection']) {
      expect(help.stdout).toContain(`smegglect-bridge ${command}`)
    }
  })
})
