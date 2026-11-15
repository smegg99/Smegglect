// src/bridge/server.ts
// Loopback broker: exact Host and Origin checks, a per-run bearer token, bounded bodies, no wildcard CORS.

import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createRegistry } from '../core/presets'
import { createAgents } from './agents'
import { removeBridgeFile, writeBridgeFile } from './bridge-file'
import { createChecks, createFeed } from './feed'
import { HttpError, sameSecret, sendJson } from './http'
import type { BrokerParts } from './call'
import { dispatch } from './routes'
import { openStore, type Store } from './store'
import { StoreError } from './store-files'

export interface BrokerOptions {
  /** Project directory; the store lives in `<root>/.smegglect`. */
  root: string
  /** 0 picks a free port. */
  port?: number
  /** Exact browser origins allowed to call the broker, e.g. `http://127.0.0.1:5199`. */
  origins: readonly string[]
  log?: (line: string) => void
  /** How long an agent may be silent before its claims return to the queue. Default five minutes. */
  agentTimeoutMs?: number
}

const AGENT_TIMEOUT_MS = 5 * 60_000

export interface Broker {
  url: string
  token: string
  store: Store
  close: () => Promise<void>
}

/** What a request must match before any route sees it. */
interface Gate {
  port: number
  token: string
  /** The broker's own set, which `/v1/origins` adds to. */
  origins: ReadonlySet<string>
}

type Refuse = (status: number, error: string) => false

/** Host, then Origin, then the token; answers a CORS preflight itself. False when the request is done. */
function admitted(req: IncomingMessage, res: ServerResponse, gate: Gate, refuse: Refuse): boolean {
  const origin = req.headers.origin
  // DNS rebinding: only the loopback names this server actually listens on.
  const hosts = [`127.0.0.1:${gate.port}`, `localhost:${gate.port}`]
  if (!hosts.includes(req.headers.host ?? '')) return refuse(421, 'host')
  if (origin !== undefined && !gate.origins.has(origin)) return refuse(403, 'origin')
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('vary', 'Origin')
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT')
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-max-age', '600')
    res.writeHead(204)
    res.end()
    return false
  }
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer ') || !sameSecret(auth.slice(7), gate.token)) return refuse(401, 'token')
  return true
}

function serve(
  req: IncomingMessage,
  res: ServerResponse,
  gate: Gate,
  parts: BrokerParts,
  log: (line: string) => void,
): void {
  const path = req.url?.split('?')[0]
  const refuse: Refuse = (status, error) => {
    sendJson(res, status, { error })
    log(`${req.method} ${path} ${status}`)
    return false
  }
  if (!admitted(req, res, gate, refuse)) return
  // A long-poll ends early when its client goes away.
  const gone = new AbortController()
  res.on('close', () => gone.abort())
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  dispatch({ req, res, url, origin: req.headers.origin, signal: gone.signal, parts }).then(
    () => log(`${req.method} ${path} ${res.statusCode}`),
    (error: unknown) => {
      if (error instanceof HttpError) return refuse(error.status, error.code)
      if (error instanceof StoreError) return refuse(400, 'path')
      log(`error ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
      refuse(500, 'internal')
    },
  )
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      done(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

async function closeBroker(server: Server, bridgeFile: string, token: string): Promise<void> {
  await removeBridgeFile(bridgeFile, token)
  const closed = new Promise<void>(done => server.close(() => done()))
  // Long-polls would hold the close for up to 50 s; their clients retry or see the bridge gone.
  server.closeAllConnections()
  await closed
}

export async function startBroker(options: BrokerOptions): Promise<Broker> {
  const registry = createRegistry()
  const store = await openStore(options.root, registry)
  const feed = createFeed()
  const agents = createAgents(options.agentTimeoutMs ?? AGENT_TIMEOUT_MS, () => feed.emit({ kind: 'status' }))
  const origins = new Set(options.origins)
  const parts: BrokerParts = { store, feed, checks: createChecks(feed), registry, agents, origins }
  const token = randomBytes(32).toString('base64url')
  const gate: Gate = { port: 0, token, origins }
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  const server = createServer((req, res) => serve(req, res, gate, parts, log))
  gate.port = await listen(server, options.port ?? 0)
  const url = `http://127.0.0.1:${gate.port}`
  const bridgeFile = await writeBridgeFile(store.root, { url, token, pid: process.pid })
  log(`smegglect bridge on ${url} for ${store.root}`)
  return { url, token, store, close: () => closeBroker(server, bridgeFile, token) }
}
