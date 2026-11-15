// src/bridge/agent-routes.ts
// The agent's side of the broker: its hello, the work list it claims from, `wait`, and the page's view of it.

import { isId } from '../core/limits'
import type { IssueProgress } from '../core/review'
import { VERSION } from '../core/version'
import { issueKey, type AgentHello } from './agents'
import type { Call } from './call'
import { sendJson, waitMs } from './http'
import { listWork, until, type WorkItem } from './work'

/**
 * Who calls: `x-smegglect-agent` names the agent, `x-smegglect-client` its software, reduced to a word.
 * Calls without them are one anonymous agent.
 */
export function helloOf(call: Call): AgentHello {
  const id = call.req.headers['x-smegglect-agent']
  const client = call.req.headers['x-smegglect-client']
  return {
    id: typeof id === 'string' && isId(id) ? id : 'anonymous',
    kind: typeof client === 'string' && /claude/i.test(client) ? 'claude' : 'other',
  }
}

export async function agentHello(call: Call) {
  call.res.writeHead(204)
  call.res.end()
}

/**
 * Open issues no other agent still alive holds. One an agent began stays with it, not offered even to
 * that agent again, until it goes quiet; then any agent may take it up.
 */
async function available(call: Call, agentId: string): Promise<WorkItem[]> {
  const { agents, store, registry } = call.parts
  const open = await listWork(store, registry)
  return open.filter((item) => {
    const holder = agents.holder(issueKey(item.batch_id, item.issue_id))
    if (item.state === 'in-progress') return holder === null
    return holder === null || holder === agentId
  })
}

/** What the agent may want to know about the link: versions, open pages, whether each sender is open. */
async function linkOf(call: Call, items: readonly WorkItem[]) {
  const pages = call.parts.checks.pages()
  const senderOpen: Record<string, boolean> = {}
  for (const batchId of new Set(items.map(item => item.batch_id))) {
    const batch = await call.parts.store.getBatch(batchId)
    senderOpen[batchId] = pages.some(page => page.id === batch?.window.id)
  }
  return {
    broker: VERSION,
    overlay: [...new Set(pages.map(page => page.version ?? 'unknown'))],
    pages: pages.map(page => ({
      page: page.id,
      viewport: page.viewport ?? null,
      visible: page.visible,
      focused: page.focused,
    })),
    senderOpen,
  }
}

/**
 * `listen=1` is `wait`: it only waits, and the agent counts as listening meanwhile. Any other call takes
 * what it gets: its batches are received, and its issues claimed unless `claim=false`.
 */
export async function work(call: Call) {
  const hello = helloOf(call)
  const { agents, feed } = call.parts
  const compute = () => available(call, hello.id)
  const wait = waitMs(call.url)
  if (call.url.searchParams.get('listen') === '1') {
    const open = await agents.listen(hello, () => until(feed, compute, wait, call.signal))
    return sendJson(call.res, 200, { open })
  }
  const open = await until(feed, compute, wait, call.signal)
  if (call.url.searchParams.get('claim') !== 'false') {
    agents.claim(hello.id, open.map(item => issueKey(item.batch_id, item.issue_id)))
  }
  for (const batchId of new Set(open.map(item => item.batch_id))) agents.received(hello.id, batchId)
  sendJson(call.res, 200, { open, link: await linkOf(call, open) })
}

/** For the page: whether an agent listens, how far each sent batch and issue has got. Words, never text. */
export async function agentStatus(call: Call) {
  const { store, agents } = call.parts
  const batches: Record<string, string> = {}
  const issues: Record<string, Record<string, IssueProgress>> = {}
  for (const batch of await store.listBatches()) {
    issues[batch.id] = Object.fromEntries(batch.issues.map(issue => {
      return [issue.id, agents.issueProgress(batch.id, issue.id, issue.state)]
    }))
    // An issue an agent marked in progress is still being worked on.
    const finished = batch.issues.every(issue => issue.state !== 'submitted' && issue.state !== 'in-progress')
    batches[batch.id] = agents.progress(batch.id, finished)
  }
  sendJson(call.res, 200, { agent: agents.status(), batches, issues })
}
