// tests/bridge/root.test.ts
// One root: the dev server's bridge, the MCP server that `init` wired and the page's source paths meet in
// the project folder, with the package and the dev root in frontend/.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch } from '../../src/core/model'
import { init } from '../../src/bridge/init'
import { startBroker, type Broker } from '../../src/bridge/server'
import { issue } from '../../src/core/validate.test'
import smegglect from '../../src/vite/index'
import { relativeFile } from '../../src/vue/index'

const servers: ViteDevServer[] = []
const brokers: Broker[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(brokers.splice(0).map(broker => broker.close()))
})

/** A project whose app lives in frontend/, with this package linked there as a consumer links it. */
function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'sg-root-'))
  mkdirSync(join(root, 'frontend/node_modules'), { recursive: true })
  symlinkSync(resolve('.'), join(root, 'frontend/node_modules/smegglect'))
  return root
}

function batch(): Batch {
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_root1', project: { id: 'demo' }, window: { id: 'win_1' },
    status: 'submitted', createdAt: '2026-11-15T00:00:00Z', submittedAt: '2026-11-15T01:00:00Z',
    issues: [issue({ id: 'iss_one', status: 'submitted' })],
    attachments: [],
  }
}

describe('one root', () => {
  it('meets in the folder init wired: the work list through its .mcp.json, source paths from there', async () => {
    const root = project()
    await init(root, '---\nname: smegglect\n---\n')
    const server = await createServer({
      root: join(root, 'frontend'),
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1', watch: null },
      plugins: [smegglect({ project: { id: 'demo' }, bridge: true, git: false })],
    })
    servers.push(server)
    await server.listen()
    // Loading the page module waits until the bridge is up.
    const loaded = await server.environments.client.pluginContainer.load('\0virtual:smegglect-client')
    const module = typeof loaded === 'string' ? loaded : loaded?.code ?? ''
    expect(existsSync(join(root, '.smegglect/bridge.json'))).toBe(true)
    expect(existsSync(join(root, 'frontend/.smegglect'))).toBe(false)

    // The page reports its source files from the project folder, where the agent works.
    expect(module).toContain(`vueSource({ root: ${JSON.stringify(root)} })`)
    expect(relativeFile(join(root, 'frontend/app/components/Toolbar.vue'), root))
      .toBe('frontend/app/components/Toolbar.vue')

    // The page sends; the MCP server runs exactly as .mcp.json says, from the project folder.
    const { url, token } = JSON.parse(readFileSync(join(root, '.smegglect/bridge.json'), 'utf8'))
    const origin = new URL(server.resolvedUrls!.local[0]!).origin
    const sent = await fetch(`${url}/v1/batches`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, origin, 'content-type': 'application/json' },
      body: JSON.stringify(batch()),
    })
    expect(sent.status).toBe(201)
    const wired = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers.smegglect
    expect(wired.args.slice(0, 1)).toEqual(['frontend/node_modules/smegglect/dist/bridge-cli.js'])
    const client = new Client({ name: 'root-test', version: '1' })
    await client.connect(new StdioClientTransport({ command: process.execPath, args: wired.args, cwd: root }))
    try {
      const res = await client.callTool({ name: 'next_work', arguments: {} }) as { content: { text: string }[] }
      expect(JSON.parse(res.content[0]!.text).open.map((item: { issue_id: string }) => item.issue_id)).toEqual(['iss_one'])
    }
    finally {
      await client.close()
    }
  })

  it('names the file it looked for and the folder where a bridge does run', async () => {
    const root = project()
    const broker = await startBroker({ root: join(root, 'frontend'), origins: [], log: () => {} })
    brokers.push(broker)
    const run = await new Promise<{ code: number, stderr: string }>((done) => {
      execFile(process.execPath, ['dist/bridge-cli.js', 'work', '--root', root], (error, _stdout, stderr) => {
        done({ code: error ? Number(error.code ?? 1) : 0, stderr })
      })
    })
    expect(run.code).toBe(1)
    expect(run.stderr).toContain(`not running for ${root} (no ${join(root, '.smegglect', 'bridge.json')})`)
    expect(run.stderr).toContain(`a bridge is running for ${join(root, 'frontend')}; start with --root ${join(root, 'frontend')}`)
  })
})
