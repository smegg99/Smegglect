// src/overlay/feed.ts
// The page end of the bridge channel, open only while the overlay is:
// the agent's checks get answers from this page.
// What the agent says back is read in its own terminal, not here.

import { markRaw } from 'vue'
import type { Numbered, PagePoll } from '../core/feed'
import type { Issue } from '../core/model'
import { VERSION } from '../core/version'
import { agentOf, follow, hush } from './progress'
import type { Runtime } from './runtime'

const RETRY_MS = 5000
/** How long a check the agent ran shows: the pulse on its target and the line above Send. */
export const CHECKING_MS = 4000
/** Events after which the agent's status may read differently. */
const STATUS_EVENTS = new Set(['status', 'results', 'batch'])
/** "Last seen" counts minutes; a status this old is asked for again. */
const STATUS_MS = 60_000
/** When each overlay last read the agent's status; per overlay, since a page may mount more than one. */
const statusAt = new WeakMap<Runtime['ui'], number>()

const stale = (rt: Runtime) => !rt.ui.agentStatus || Date.now() - (statusAt.get(rt.ui) ?? 0) > STATUS_MS

/** The newest status read each overlay started; reads overlap when feed events come close together. */
const reads = new WeakMap<Runtime['ui'], number>()

/** Whether an agent listens and how far each sent report has got, as words for the Issues tab. */
export async function refreshStatus(rt: Runtime): Promise<void> {
  const bridge = rt.engine.bridge
  if (!bridge || !rt.settings.agentStatus) return
  statusAt.set(rt.ui, Date.now())
  const read = (reads.get(rt.ui) ?? 0) + 1
  reads.set(rt.ui, read)
  const status = await bridge.status()
  // One a newer read started after says less than that one will: it would turn the progress back.
  if (reads.get(rt.ui) !== read) return
  rt.ui.agentStatus = status
  follow(rt, status)
}

/** Waits, or less when the feed stops; the abort listener goes with the wait, so none pile up offline. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const stop = () => {
      clearTimeout(timer)
      done()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      done()
    }, ms)
    signal.addEventListener('abort', stop, { once: true })
  })
}

/** This page as the broker sees it: its window id, whether a person is looking at it, and its role. */
function pollOf(rt: Runtime): PagePoll {
  const doc = rt.doc
  return {
    id: rt.engine.session.store.get().windowId,
    visible: doc.visibilityState === 'visible',
    // Popped out, the person works in the overlay's own window.
    focused: doc.hasFocus() || (rt.popout.value?.doc.hasFocus() ?? false),
    observer: rt.settings.watchOnly || (rt.engine.bridge?.observer ?? false),
    version: VERSION,
    viewport: { width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
  }
}

/**
 * Shows the person that the agent is checking this issue, for a while; a newer check takes its place. A
 * report this window holds also gets a History line.
 */
function showCheck(rt: Runtime, check: { id: string, batchId: string, held: boolean }, issue: Issue): void {
  if (!rt.settings.agentStatus) return
  const { batchId } = check
  const until = Date.now() + CHECKING_MS
  rt.ui.checking = { batchId, issueId: issue.id, seq: issue.seq, until, issue: markRaw(issue) }
  if (!check.held) return
  // One line per check however many windows answer it: they share the project's History.
  const step = { kind: 'checked', batchId, issueId: issue.id, seq: issue.seq, agent: agentOf(rt) } as const
  rt.engine.session.log({ id: `evt_checked_${check.id}`, ...step })
  setTimeout(() => {
    if (rt.ui.checking?.until === until && rt.ui.checking.issueId === issue.id) rt.ui.checking = null
  }, CHECKING_MS)
}

async function answer(rt: Runtime, event: Extract<Numbered, { kind: 'check' }>, page: string) {
  const bridge = rt.engine.bridge
  if (!bridge) return
  const request = event.request
  if (request.kind === 'selection') return bridge.answer(event.id, page, await rt.engine.describeSelection())
  // A batch sent from another browser is not stored here; the bridge has it.
  const held = rt.engine.session.store.get().submitted.find(batch => batch.id === request.batchId)
  const sent = held ?? await bridge.batch(request.batchId)
  const issue = sent?.issues.find(candidate => candidate.id === request.issueId)
  if (issue) showCheck(rt, { id: event.id, batchId: request.batchId, held: !!held }, issue)
  return bridge.answer(event.id, page, issue ? rt.engine.check(issue) : { status: 'unknown' })
}

/** Starts listening; the returned function stops it, ending the open request too. */
export function startFeed(rt: Runtime): () => void {
  const bridge = rt.engine.bridge
  if (!bridge) return () => {}
  const stop = new AbortController()
  const { signal } = stop
  // What came while the overlay was folded goes to History; its toasts would be old news.
  hush(rt)
  void (async () => {
    let after: number | null = null
    while (!signal.aborted) {
      const poll = pollOf(rt)
      const res = await bridge.next(after, poll, signal)
      if (signal.aborted) return
      if (!res) {
        rt.ui.bridge = 'offline'
        after = null
        await pause(RETRY_MS, signal)
        continue
      }
      rt.ui.bridge = 'connected'
      after = res.seq
      if (res.events.some(event => STATUS_EVENTS.has(event.kind)) || stale(rt)) void refreshStatus(rt)
      for (const event of res.events) {
        // The broker puts a check only to the pages it asks; an observer is never one of them.
        const mine = event.kind === 'check' && !poll.observer && event.to.includes(poll.id)
        if (mine) void answer(rt, event, poll.id)
      }
    }
  })()
  return () => stop.abort()
}
