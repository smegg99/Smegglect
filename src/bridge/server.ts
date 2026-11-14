// src/bridge/server.ts
// Loopback broker: exact Host and Origin checks, a per-run bearer token, bounded bodies, no wildcard CORS.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, rm, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { FollowUp } from '../core/model'
import { createRegistry, type PresetDef } from '../core/presets'
import { isId } from '../core/validate'
import type { CheckRequest } from '../core/feed'
import { createChecks, createFeed } from './feed'
import { openStore, StoreError, type Put, type Store } from './store'

export const JSON_LIMIT = 2 * 1024 * 1024
export const ATTACHMENT_BODY_LIMIT = 5 * 1024 * 1024

export interface BrokerOptions {
  /** Project directory; the store lives in `<root>/.smegglect`. */
  root: string
  /** 0 picks a free port. */
  port?: number
  /** Exact browser origins allowed to call the broker, e.g. `http://127.0.0.1:5199`. */
  origins: readonly string[]
  presets?: readonly PresetDef[]
  log?: (line: string) => void
}

export interface Broker {
  url: string
  token: string
  store: Store
  close: () => Promise<void>
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

const STATUS: Record<Put, number> = { stored: 201, duplicate: 200, conflict: 409, invalid: 422, missing: 404 }

/** An issue sent and not yet answered by the agent, or reopened by the person since. */
export interface WorkItem {
  batchId: string
  issueId: string
  seq: number
  preset: string
  state: 'submitted' | 'reopened'
  /** For a reopened issue: the person's reasons and notes since the agent's last result. */
  said?: string[]
}

/** `?wait=<seconds>`, at most 50, for long-polling clients. */
function waitMs(url: URL): number {
  const n = Number(url.searchParams.get('wait') ?? 0)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 50) * 1000 : 0
}

function checkRequest(input: unknown): CheckRequest | null {
  const r = input as Partial<{ kind: string, batchId: string, issueId: string }> | null
  if (r?.kind === 'selection') return { kind: 'selection' }
  if (r?.kind === 'issue' && isId(r.batchId ?? '') && isId(r.issueId ?? '')) return { kind: 'issue', batchId: r.batchId!, issueId: r.issueId! }
  return null
}

function saidSince(followUps: readonly FollowUp[], issueId: string): string[] {
  const mine = followUps.filter(f => f.issueId === issueId)
  const after = mine.map(f => f.actor).lastIndexOf('agent') + 1
  return mine.slice(after).filter(f => f.actor === 'human').map(f => [f.reason, f.text].filter(Boolean).join(': ')).filter(Boolean)
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, 'too-large')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'too-large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

async function json(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'json-only')
  try {
    return JSON.parse((await body(req, JSON_LIMIT)).toString('utf8'))
  }
  catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, 'bad-json')
  }
}

export async function startBroker(o: BrokerOptions): Promise<Broker> {
  const registry = createRegistry(o.presets ?? [])
  const store = await openStore(o.root, registry)
  const token = randomBytes(32).toString('base64url')
  const origins = new Set(o.origins)
  const log = o.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  const feed = createFeed()
  const checks = createChecks(feed)
  let port = 0

  /** Oldest batch first, issues in their order. */
  async function work(): Promise<WorkItem[]> {
    const out: WorkItem[] = []
    for (const b of (await store.listBatches()).reverse()) {
      const open = b.issues.filter(i => i.state === 'submitted' || i.state === 'reopened')
      if (!open.length) continue
      const f = open.some(i => i.state === 'reopened') ? await store.followUps(b.id) : []
      for (const i of open) {
        const state = i.state as WorkItem['state']
        out.push({ batchId: b.id, issueId: i.id, seq: i.seq, preset: i.preset, state, ...(state === 'reopened' ? { said: saidSince(f, i.id) } : {}) })
      }
    }
    return out
  }

  /** Recomputes on every change until there is something, the wait ends or the client goes away. */
  async function until<T>(compute: () => Promise<T[]>, ms: number, signal: AbortSignal): Promise<T[]> {
    const end = Date.now() + ms
    let value = await compute()
    while (!value.length && Date.now() < end && !signal.aborted) {
      await feed.next(end - Date.now(), signal)
      value = await compute()
    }
    return value
  }

  /** Without a valid cursor the page gets the current one and no history: old checks are stale. */
  async function pageNext(url: URL, signal: AbortSignal) {
    const after = Number(url.searchParams.get('after') ?? Number.NaN)
    if (!Number.isInteger(after) || after < 0 || after > feed.seq) return { seq: feed.seq, events: [] }
    const events = await until(async () => feed.since(after), waitMs(url), signal)
    return { seq: events.at(-1)?.seq ?? after, events }
  }

  async function route(req: IncomingMessage, res: ServerResponse, origin: string | undefined, signal: AbortSignal) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'v1') throw new HttpError(404, 'not-found')
    const [, a, id, b, sub] = parts
    if (id !== undefined && !isId(id)) throw new HttpError(404, 'not-found')
    if (sub !== undefined && !isId(sub)) throw new HttpError(404, 'not-found')
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(value))
    }
    const m = req.method
    if (a === 'health' && m === 'GET' && !id) return send(200, { ok: true, version: 1 })
    if (a === 'work' && m === 'GET' && !id) return send(200, { open: await until(work, waitMs(url), signal) })
    // The page channel is for browsers; questions come from agents, answers from pages.
    if (a === 'page' && id === 'next' && !b && m === 'GET') {
      if (!origin) throw new HttpError(403, 'page-only')
      return send(200, await checks.polled(() => pageNext(url, signal)))
    }
    if (a === 'checks' && !id && m === 'POST') {
      if (origin) throw new HttpError(403, 'agent-only')
      const request = checkRequest(await json(req))
      if (!request) throw new HttpError(422, 'invalid')
      if (!checks.connected()) return send(409, { error: 'no-page' })
      const answer = await checks.ask(request)
      return answer === null ? send(504, { error: 'no-answer' }) : send(200, answer)
    }
    if (a === 'checks' && id && !b && m === 'POST') {
      if (!origin) throw new HttpError(403, 'page-only')
      if (!checks.answer(id, await json(req))) throw new HttpError(404, 'not-found')
      res.writeHead(204)
      return res.end()
    }
    if (a !== 'batches') throw new HttpError(404, 'not-found')
    if (!id && m === 'GET') return send(200, await store.listBatches())
    if (!id && m === 'POST') {
      const input = await json(req)
      const result = await store.putBatch(input)
      if (result === 'stored') feed.emit({ kind: 'batch', batchId: (input as { id: string }).id })
      return send(STATUS[result], { result })
    }
    if (id && !b && m === 'GET') {
      const batch = await store.getBatch(id)
      return batch ? send(200, batch) : send(404, { error: 'not-found' })
    }
    if (id && b === 'issues' && sub && m === 'GET') {
      const issue = await store.issue(id, sub)
      return issue ? send(200, issue) : send(404, { error: 'not-found' })
    }
    if (id && b === 'followups' && !sub && m === 'GET') return send(200, await store.followUps(id))
    if (id && b === 'followups' && !sub && m === 'POST') {
      const input = await json(req) as FollowUp
      if (!input || typeof input !== 'object' || input.batchId !== id) throw new HttpError(422, 'invalid')
      // Browsers record human reviews; clients without an Origin (the MCP process) record agent results.
      if ((origin ? 'human' : 'agent') !== input.actor) throw new HttpError(403, 'wrong-actor')
      const result = await store.addFollowUp(input)
      if (result === 'stored') feed.emit({ kind: 'results', batchId: id, actor: input.actor })
      return send(STATUS[result], { result })
    }
    if (id && b === 'attachments' && sub && m === 'PUT') {
      const mime = (req.headers['content-type'] ?? '').split(';')[0]!.trim()
      const result = await store.putAttachment(id, sub, mime, new Uint8Array(await body(req, ATTACHMENT_BODY_LIMIT)))
      return send(STATUS[result], { result })
    }
    if (id && b === 'attachments' && sub && m === 'GET') {
      const file = await store.attachment(id, sub)
      if (!file) return send(404, { error: 'not-found' })
      res.writeHead(200, { 'content-type': file.mime })
      return res.end(file.bytes)
    }
    throw new HttpError(405, 'method')
  }

  const server = createServer((req, res) => {
    const origin = req.headers.origin
    const status = (code: number, error: string) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error }))
      log(`${req.method} ${req.url?.split('?')[0]} ${code}`)
    }
    // DNS rebinding: only the loopback names this server actually listens on.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return status(421, 'host')
    if (origin !== undefined && !origins.has(origin)) return status(403, 'origin')
    if (origin) {
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-methods', 'GET, POST, PUT')
      res.setHeader('access-control-allow-headers', 'authorization, content-type')
      res.setHeader('access-control-max-age', '600')
      res.writeHead(204)
      return res.end()
    }
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ') || !same(auth.slice(7), token)) return status(401, 'token')
    // A long-poll ends early when its client goes away.
    const gone = new AbortController()
    res.on('close', () => gone.abort())
    route(req, res, origin, gone.signal).then(
      () => log(`${req.method} ${req.url?.split('?')[0]} ${res.statusCode}`),
      (e: unknown) => {
        if (e instanceof HttpError) return status(e.status, e.code)
        if (e instanceof StoreError) return status(400, 'path')
        log(`error ${(e as Error)?.name ?? 'unknown'}`)
        status(500, 'internal')
      },
    )
  })

  await new Promise<void>((done, fail) => {
    server.once('error', fail)
    server.listen(o.port ?? 0, '127.0.0.1', () => done())
  })
  const address = server.address()
  port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}`
  const info = join(store.root, 'bridge.json')
  const tmp = `${info}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify({ url, token, pid: process.pid }), { mode: 0o600, flag: 'wx' })
  await rename(tmp, info)
  log(`smegglect bridge on ${url} for ${store.root}`)

  return {
    url,
    token,
    store,
    async close() {
      // A broker started later for the same project may have replaced the file; that one stays.
      const current = await readFile(info, 'utf8').then(text => (JSON.parse(text) as { token?: unknown }).token, () => null)
      if (current === token) await rm(info, { force: true })
      const closed = new Promise<void>(done => server.close(() => done()))
      // Long-polls would hold the close for up to 50 s; their clients retry or see the bridge gone.
      server.closeAllConnections()
      await closed
    },
  }
}
