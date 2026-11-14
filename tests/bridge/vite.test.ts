// tests/bridge/vite.test.ts
// `bridge: true` starts the broker with the dev server, or uses one already running for the project.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { startBroker } from '../../src/bridge/server'
import smegglect from '../../src/vite/index'

const open: ViteDevServer[] = []

async function dev(root: string): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1', watch: null },
    plugins: [smegglect({ project: { id: 'demo' }, bridge: true, git: false, vue: false })],
  })
  open.push(server)
  await server.listen()
  return server
}

const info = (root: string) => JSON.parse(readFileSync(join(root, '.smegglect/bridge.json'), 'utf8')) as { url: string, token: string }

/** What the page module carries, as the browser would get it. */
async function pageModule(server: ViteDevServer): Promise<string> {
  const loaded = await server.environments.client.pluginContainer.load('\0virtual:smegglect-client')
  return typeof loaded === 'string' ? loaded : loaded?.code ?? ''
}

const health = (url: string, token: string, origin?: string) =>
  fetch(`${url}/v1/health`, { headers: { authorization: `Bearer ${token}`, ...(origin ? { origin } : {}) } }).then(r => r.status, () => 0)

afterEach(async () => {
  await Promise.all(open.splice(0).map(s => s.close()))
})

describe('Vite plugin bridge', () => {
  it('starts a broker with the dev server, admits its origins and stops with it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-vite-'))
    const server = await dev(root)
    const port = new URL(server.resolvedUrls!.local[0]!).port
    expect(await pageModule(server)).toContain('"bridge":{')
    const { url, token } = info(root)
    expect(await pageModule(server)).toContain(url)
    expect(await health(url, token, `http://127.0.0.1:${port}`)).toBe(200)
    expect(await health(url, token, `http://localhost:${port}`)).toBe(200)
    expect(await health(url, token, 'http://127.0.0.1:1')).toBe(403)
    await server.close()
    expect(existsSync(join(root, '.smegglect/bridge.json'))).toBe(false)
    expect(await health(url, token)).toBe(0)
  })

  it('uses a broker already running for the project and leaves it running', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-vite-'))
    const broker = await startBroker({ root, origins: [], log: () => {} })
    try {
      const server = await dev(root)
      expect(await pageModule(server)).toContain(broker.url)
      expect(info(root).token).toBe(broker.token)
      await server.close()
      expect(await health(broker.url, broker.token)).toBe(200)
      expect(info(root).token).toBe(broker.token)
    }
    finally {
      await broker.close()
    }
  })
})

describe('broker files', () => {
  it('a closing broker leaves the bridge file of the broker that replaced it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-vite-'))
    const first = await startBroker({ root, origins: [], log: () => {} })
    const second = await startBroker({ root, origins: [], log: () => {} })
    await first.close()
    expect(info(root).token).toBe(second.token)
    await second.close()
    expect(existsSync(join(root, '.smegglect/bridge.json'))).toBe(false)
  })
})
