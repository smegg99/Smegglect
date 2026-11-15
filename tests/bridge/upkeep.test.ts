// tests/bridge/upkeep.test.ts
// A bridge of another version, a second dev server on the same root, and a bridge file left by a broker that is gone.
import { execFile, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'
import { devBridge } from '../../src/bridge/dev-bridge'
import { startBroker, type Broker } from '../../src/bridge/server'

const run = promisify(execFile)
const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

const project = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

function writeBridge(root: string, file: { url: string, token: string, pid: number }) {
  mkdirSync(join(root, '.smegglect'), { recursive: true })
  writeFileSync(join(root, '.smegglect', 'bridge.json'), JSON.stringify(file), { mode: 0o600 })
}

/** A broker that answers as an older Smegglect would: its health names another version. */
async function olderBroker(root: string): Promise<void> {
  const server: Server = createServer((req, res) => {
    const answers: Record<string, unknown> = {
      '/v1/health': { ok: true, version: '0.0.1-old', root },
      '/v1/batches': [],
    }
    const body = answers[req.url?.split('?')[0] ?? ''] ?? {}
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  writeBridge(root, { url: `http://127.0.0.1:${port}`, token: 't', pid: process.pid })
  cleanups.push(() => new Promise(done => server.close(() => done())))
}

async function startedBroker(root: string, origins: string[]): Promise<Broker> {
  const broker = await startBroker({ root, origins, log: () => {} })
  cleanups.push(() => broker.close())
  return broker
}

describe('a bridge of another version', () => {
  it('the CLI warns in one line on stderr and keeps stdout the answer', async () => {
    const root = project('sg-version-')
    await olderBroker(root)
    const { stdout, stderr } = await run(process.execPath, ['dist/bridge-cli.js', 'batches', '--root', root])
    expect(JSON.parse(stdout)).toEqual([])
    const lines = stderr.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('0.0.1-old')
    expect(lines[0]).toContain(VERSION)
  })

  it('an MCP tool adds the warning as one more line of its answer', async () => {
    const root = project('sg-version-')
    await olderBroker(root)
    const client = new Client({ name: 'upkeep-test', version: '1' })
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['dist/bridge-cli.js', 'mcp', '--root', root],
      stderr: 'ignore',
    }))
    cleanups.push(() => client.close())
    const res = await client.callTool({ name: 'list_batches', arguments: {} }) as { content: { text: string }[] }
    expect(JSON.parse(res.content[0]!.text)).toEqual([])
    expect(res.content).toHaveLength(2)
    expect(res.content[1]!.text).toContain('0.0.1-old')
  })

  it('the same version adds nothing', async () => {
    const root = project('sg-version-')
    await startedBroker(root, [])
    const { stderr } = await run(process.execPath, ['dist/bridge-cli.js', 'batches', '--root', root])
    expect(stderr).toBe('')
  })
})

describe('a second dev server on the same root', () => {
  const first = 'http://127.0.0.1:5301'
  const second = 'http://localhost:5302'
  const asPage = (broker: Broker, origin: string) => fetch(`${broker.url}/v1/batches`, {
    headers: { authorization: `Bearer ${broker.token}`, origin },
  }).then(res => res.status)
  const addOrigins = (broker: Broker, origins: string[], headers: Record<string, string> = {}) => {
    return fetch(`${broker.url}/v1/origins`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${broker.token}`, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ origins }),
    }).then(res => res.status)
  }

  it('a local caller adds loopback origins to the running broker; a page and other origins cannot', async () => {
    const broker = await startedBroker(project('sg-origins-'), [first])
    expect(await asPage(broker, second)).toBe(403)
    expect(await addOrigins(broker, [second], { origin: first })).toBe(403)
    expect(await addOrigins(broker, ['https://example.com'])).toBe(422)
    expect(await addOrigins(broker, ['http://127.0.0.1:5302/path'])).toBe(422)
    expect(await addOrigins(broker, [second])).toBe(204)
    expect(await asPage(broker, second)).toBe(200)
    expect(await asPage(broker, first)).toBe(200)
  })

  it('an adapter that reuses the broker adds its own origins to it', async () => {
    const root = project('sg-origins-')
    const broker = await startedBroker(root, [first])
    const log = { info: () => {}, warn: () => {} }
    const reused = await devBridge(root, [second], log)
    expect(reused?.link.url).toBe(broker.url)
    expect(await asPage(broker, second)).toBe(200)
  })
})

describe('a bridge file left by a broker that is gone', () => {
  it('says the bridge that wrote it is gone, with its pid', async () => {
    const root = project('sg-stale-')
    const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])
    const pid = Number(gone.stdout.toString())
    const closed = await new Promise<number>((done) => {
      const server = createServer()
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        server.close(() => done(typeof address === 'object' && address ? address.port : 0))
      })
    })
    writeBridge(root, { url: `http://127.0.0.1:${closed}`, token: 't', pid })
    const answer = run(process.execPath, ['dist/bridge-cli.js', 'batches', '--root', root])
    await expect(answer).rejects.toMatchObject({ code: 1 })
    const { stderr } = await answer.catch((error: { stderr: string }) => error)
    expect(stderr).toContain(`pid ${pid}`)
    expect(stderr).toMatch(/is gone/)
    expect(stderr).not.toMatch(/did not answer/)
  })
})
