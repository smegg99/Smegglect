// src/bridge/client.ts
// How the MCP process reaches the broker: the address and token the running broker wrote, read per call.

import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { BRIDGE_FILE, readBridgeFile, type BridgeFile } from './bridge-file'

/** No broker to reach; `nearby` is a folder next to the root that has one, when there is such a folder. */
export class Disconnected extends Error {
  constructor(message: string, readonly nearby: string | null = null) {
    super(message)
  }
}

/** One folder up, then each folder one down, that has a bridge file of its own. */
function nearbyBridge(root: string): string | null {
  const below = readdirSync(root, { withFileTypes: true, encoding: 'utf8' })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map(entry => join(root, entry.name))
  return [dirname(root), ...below].find(dir => readBridgeFile(dir) !== null) ?? null
}

/** Says which file was missing, and where a bridge does run when one is next door. */
function notRunning(root: string): Disconnected {
  const absolute = resolve(root)
  const tried = join(absolute, '.smegglect', BRIDGE_FILE)
  let nearby: string | null = null
  try {
    nearby = nearbyBridge(absolute)
  }
  catch {
    // The root itself is missing or unreadable; there is nothing next door to point at.
  }
  const message = `the Smegglect bridge is not running for ${absolute} (no ${tried})`
  if (!nearby) return new Disconnected(message)
  const hint = `a bridge is running for ${nearby}; start with --root ${nearby}`
  return new Disconnected(`${message}; ${hint}`, nearby)
}

/** Whether a process runs with this pid; EPERM means it runs, as another user. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** A broker that does not answer: gone, when the process that wrote the file has ended. */
function silent(root: string, bridge: BridgeFile): Disconnected {
  const alive = bridge.pid === undefined || running(bridge.pid)
  if (alive) return new Disconnected('the Smegglect bridge did not answer')
  const file = join(resolve(root), '.smegglect', BRIDGE_FILE)
  return new Disconnected(`the bridge that wrote ${file} (pid ${bridge.pid}) is gone`)
}

/** `body` is what a 200 or 201 carries; another status carries `{ error }`, and a 204 nothing (null). */
export interface Answer<T> {
  status: number
  body: T
}

/** A file the broker served: an approved image. */
export interface FileAnswer {
  status: number
  mime: string
  bytes: Buffer
}

export interface BrokerClient {
  get: <T>(path: string) => Promise<Answer<T>>
  post: <T>(path: string, value: unknown) => Promise<Answer<T>>
  file: (path: string) => Promise<FileAnswer>
}

/** How an agent's calls name it to the broker; `client` may change once the MCP client says who it is. */
export interface AgentIdentity {
  id: string
  client: string
}

export function brokerClient(root: string, agent?: AgentIdentity): BrokerClient {
  async function send(method: string, path: string, value?: unknown): Promise<Response> {
    const bridge = readBridgeFile(root)
    if (!bridge) throw notRunning(root)
    const headers: Record<string, string> = { authorization: `Bearer ${bridge.token}` }
    if (agent) {
      headers['x-smegglect-agent'] = agent.id
      headers['x-smegglect-client'] = agent.client
    }
    if (value !== undefined) headers['content-type'] = 'application/json'
    try {
      return await fetch(`${bridge.url}${path}`, {
        method,
        headers,
        body: value === undefined ? undefined : JSON.stringify(value),
      })
    }
    catch {
      throw silent(root, bridge)
    }
  }
  async function call<T>(method: string, path: string, value?: unknown): Promise<Answer<T>> {
    const res = await send(method, path, value)
    const text = await res.text()
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T }
  }
  return {
    get: path => call('GET', path),
    post: (path, value) => call('POST', path, value),
    async file(path) {
      const res = await send('GET', path)
      const mime = res.headers.get('content-type') ?? ''
      return { status: res.status, mime, bytes: Buffer.from(await res.arrayBuffer()) }
    },
  }
}
