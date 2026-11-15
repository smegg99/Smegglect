// src/bridge/routes.ts
// The broker's API as a table: method, path, who may call it, and the handler that answers.

import { dirname } from 'node:path'
import { ATTACHMENT_MAX_BYTES } from '../core/attachments'
import type { CheckRequest, Numbered, PagePoll } from '../core/feed'
import { parseFollowUp } from '../core/review'
import { isId } from '../core/limits'
import { VERSION } from '../core/version'
import { param, type Call, type Caller } from './call'
import { HttpError, readBody, readJson, sendJson, waitMs } from './http'
import type { Put } from './store'
import { agentHello, agentStatus, helloOf, work } from './agent-routes'
import { issueKey } from './agents'
import { until } from './work'

interface Route {
  method: 'GET' | 'POST' | 'PUT'
  /** `:name` stands for one path segment that must be an id. */
  path: string
  caller: Caller
  handle: (call: Call) => Promise<void>
}

const STATUS: Record<Put, number> = { stored: 201, duplicate: 200, conflict: 409, invalid: 422, missing: 404 }

function parseCheckRequest(input: unknown): CheckRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const { kind, batchId, issueId } = input as Record<string, unknown>
  if (kind === 'selection') return { kind: 'selection' }
  if (kind === 'issue' && isId(batchId) && isId(issueId)) return { kind: 'issue', batchId, issueId }
  return null
}

/** The id of a batch the store has just accepted. */
function batchIdOf(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null
  const { id } = input as Record<string, unknown>
  return isId(id) ? id : null
}

/** The broker's package version and the folder it serves, for the page's About and for agents. */
async function health({ res, parts }: Call) {
  sendJson(res, 200, { ok: true, version: VERSION, root: dirname(parts.store.root) })
}

/** What a page says about itself on each poll: `?page=<window id>&visible=1&focused=1&observer=1`. */
function pollOf(url: URL): PagePoll {
  const id = url.searchParams.get('page')
  if (!isId(id)) throw new HttpError(422, 'page')
  const flag = (name: string) => url.searchParams.get(name) === '1'
  const size = (name: string) => {
    const value = Math.round(Number(url.searchParams.get(name)) || 0)
    return Math.max(0, Math.min(100_000, value))
  }
  const version = url.searchParams.get('version') ?? ''
  return {
    id,
    visible: flag('visible'),
    focused: flag('focused'),
    observer: flag('observer'),
    // A version is a word from a short fixed alphabet; anything else is not shown to the agent.
    version: /^[\w.+-]{1,32}$/.test(version) ? version : undefined,
    viewport: url.searchParams.has('w') ? { width: size('w'), height: size('h') } : undefined,
  }
}

/** A page sees every event but the checks put to other pages. */
const forPage = (page: string) => (event: Numbered) => event.kind !== 'check' || event.to.includes(page)

/** Without a valid cursor the page gets the current one and no history: old checks are stale. */
async function pageNext({ res, url, signal, parts }: Call) {
  const { feed, checks } = parts
  const poll = pollOf(url)
  const answer = await checks.polled(poll, signal, async () => {
    const after = Number(url.searchParams.get('after') ?? Number.NaN)
    if (!Number.isInteger(after) || after < 0 || after > feed.seq) return { seq: feed.seq, events: [] }
    // The cursor moves past checks put to other pages, but never past an event this page was not shown.
    let upTo = after
    const mine = async () => {
      upTo = feed.seq
      return feed.since(after).filter(forPage(poll.id))
    }
    const events = await until(feed, mine, waitMs(url), signal)
    return { seq: upTo, events }
  })
  sendJson(res, 200, answer)
}

/** The page's answer, with which page gave it and whether that page sent the batch. */
async function askPage({ req, res, parts }: Call) {
  const request = parseCheckRequest(await readJson(req))
  if (!request) throw new HttpError(422, 'invalid')
  if (!parts.checks.connected()) return sendJson(res, 409, { error: 'no-page' })
  const batch = request.kind === 'issue' ? await parts.store.getBatch(request.batchId) : null
  const sender = batch?.window.id
  const answer = await parts.checks.ask(request, sender)
  if (answer === null) return sendJson(res, 504, { error: 'no-answer' })
  const answeredBy = { page: answer.page, sentTheBatch: sender !== undefined && answer.page === sender }
  const given = answer.value
  const isObject = typeof given === 'object' && given !== null
  const value = isObject ? given : { answer: given }
  sendJson(res, 200, { ...value, answeredBy })
}

async function answerCheck(call: Call) {
  const page = call.url.searchParams.get('page') ?? ''
  if (!call.parts.checks.answer(param(call, 'checkId'), page, await readJson(call.req))) {
    throw new HttpError(404, 'not-found')
  }
  call.res.writeHead(204)
  call.res.end()
}

async function listBatches({ res, parts }: Call) {
  sendJson(res, 200, await parts.store.listBatches())
}

async function putBatch({ req, res, parts }: Call) {
  const input = await readJson(req)
  const result = await parts.store.putBatch(input)
  const batchId = batchIdOf(input)
  if (result === 'stored' && batchId) parts.feed.emit({ kind: 'batch', batchId })
  sendJson(res, STATUS[result], { result })
}

async function getBatch(call: Call) {
  const batch = await call.parts.store.getBatch(param(call, 'batchId'))
  if (!batch) return sendJson(call.res, 404, { error: 'not-found' })
  sendJson(call.res, 200, batch)
}

async function getIssue(call: Call) {
  const record = await call.parts.store.issue(param(call, 'batchId'), param(call, 'issueId'))
  if (!record) return sendJson(call.res, 404, { error: 'not-found' })
  sendJson(call.res, 200, record)
}

async function listFollowUps(call: Call) {
  sendJson(call.res, 200, await call.parts.store.followUps(param(call, 'batchId')))
}

/** Only an agent records: a person answers the agent in its terminal. */
async function addFollowUp(call: Call) {
  const batchId = param(call, 'batchId')
  const input = await readJson(call.req)
  const fields = typeof input === 'object' && input !== null ? input as Record<string, unknown> : null
  if (!fields || fields.batchId !== batchId) throw new HttpError(422, 'invalid')
  if (fields.actor !== 'agent') throw new HttpError(403, 'wrong-actor')
  const followUp = parseFollowUp(input)
  const result: Put = followUp ? await call.parts.store.addFollowUp(followUp) : 'invalid'
  if (result === 'stored') call.parts.feed.emit({ kind: 'results', batchId })
  // An issue begun is its agent's, even one it looked at without taking.
  if (followUp && result !== 'invalid' && followUp.state === 'in-progress') {
    call.parts.agents.claim(helloOf(call).id, [issueKey(batchId, followUp.issueId)])
  }
  sendJson(call.res, STATUS[result], { result })
}

/** A dev server's own origins: http or https on loopback with a port, as the adapters build them. */
const DEV_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/
const ORIGINS_LIMIT = 8

/** A second dev server on the same root admits its pages to the running broker. */
async function addOrigins(call: Call) {
  const input = await readJson(call.req)
  const body = typeof input === 'object' && input !== null ? input as { origins?: unknown } : null
  const origins = body?.origins
  const fits = Array.isArray(origins) && origins.length <= ORIGINS_LIMIT
    && origins.every(origin => typeof origin === 'string' && DEV_ORIGIN.test(origin))
  if (!fits) throw new HttpError(422, 'invalid')
  for (const origin of origins) call.parts.origins.add(origin)
  call.res.writeHead(204)
  call.res.end()
}

async function putAttachment(call: Call) {
  const mime = (call.req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? ''
  const bytes = new Uint8Array(await readBody(call.req, ATTACHMENT_MAX_BYTES))
  const result = await call.parts.store.putAttachment(
    param(call, 'batchId'),
    param(call, 'attachmentId'),
    mime,
    bytes,
  )
  sendJson(call.res, STATUS[result], { result })
}

/** Each issue's approved images, with their paths under the bridge root. */
async function listImages(call: Call) {
  const images = await call.parts.store.images(param(call, 'batchId'))
  sendJson(call.res, 200, Object.fromEntries(images))
}

async function getAttachment(call: Call) {
  const file = await call.parts.store.attachment(param(call, 'batchId'), param(call, 'attachmentId'))
  if (!file) return sendJson(call.res, 404, { error: 'not-found' })
  call.res.writeHead(200, { 'content-type': file.mime })
  call.res.end(file.bytes)
}

const ROUTES: Route[] = [
  { method: 'GET', path: '/v1/health', caller: 'either', handle: health },
  { method: 'GET', path: '/v1/work', caller: 'agent', handle: work },
  { method: 'POST', path: '/v1/agents/hello', caller: 'agent', handle: agentHello },
  // Local processes only: a page cannot admit another origin.
  { method: 'POST', path: '/v1/origins', caller: 'agent', handle: addOrigins },
  { method: 'GET', path: '/v1/status', caller: 'page', handle: agentStatus },
  // The page channel is for browsers; questions come from agents, answers from pages.
  { method: 'GET', path: '/v1/page/next', caller: 'page', handle: pageNext },
  { method: 'POST', path: '/v1/checks', caller: 'agent', handle: askPage },
  { method: 'POST', path: '/v1/checks/:checkId', caller: 'page', handle: answerCheck },
  { method: 'GET', path: '/v1/batches', caller: 'either', handle: listBatches },
  { method: 'POST', path: '/v1/batches', caller: 'either', handle: putBatch },
  { method: 'GET', path: '/v1/batches/:batchId', caller: 'either', handle: getBatch },
  { method: 'GET', path: '/v1/batches/:batchId/issues/:issueId', caller: 'either', handle: getIssue },
  { method: 'GET', path: '/v1/batches/:batchId/followups', caller: 'either', handle: listFollowUps },
  { method: 'POST', path: '/v1/batches/:batchId/followups', caller: 'agent', handle: addFollowUp },
  { method: 'GET', path: '/v1/batches/:batchId/attachments', caller: 'agent', handle: listImages },
  {
    method: 'PUT',
    path: '/v1/batches/:batchId/attachments/:attachmentId',
    caller: 'either',
    handle: putAttachment,
  },
  {
    method: 'GET',
    path: '/v1/batches/:batchId/attachments/:attachmentId',
    caller: 'either',
    handle: getAttachment,
  },
]

/** Path parameters when the path has the route's shape, each one an id; null when it does not. */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const wanted = pattern.split('/').filter(Boolean)
  const given = pathname.split('/').filter(Boolean)
  if (wanted.length !== given.length) return null
  const params: Record<string, string> = {}
  for (const [i, segment] of wanted.entries()) {
    const value = given[i] ?? ''
    if (!segment.startsWith(':')) {
      if (segment !== value) return null
      continue
    }
    if (!isId(value)) return null
    params[segment.slice(1)] = value
  }
  return params
}

const REFUSAL: Record<Caller, { refuses: (origin: string | undefined) => boolean, code: string }> = {
  page: { refuses: origin => !origin, code: 'page-only' },
  agent: { refuses: origin => !!origin, code: 'agent-only' },
  either: { refuses: () => false, code: '' },
}

/** An unknown path is 404; a known one asked with another method is 405. */
export async function dispatch(call: Omit<Call, 'params'>): Promise<void> {
  const matches = ROUTES
    .map(route => ({ route, params: matchPath(route.path, call.url.pathname) }))
    .filter(match => match.params !== null)
  if (!matches.length) throw new HttpError(404, 'not-found')
  const match = matches.find(candidate => candidate.route.method === call.req.method)
  if (!match?.params) throw new HttpError(405, 'method')
  const refusal = REFUSAL[match.route.caller]
  if (refusal.refuses(call.origin)) throw new HttpError(403, refusal.code)
  const routed = { ...call, params: match.params }
  // Any call an agent makes says it is there.
  if (!call.origin) call.parts.agents.seen(helloOf(routed))
  await match.route.handle(routed)
}
