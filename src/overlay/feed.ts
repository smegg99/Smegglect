// src/overlay/feed.ts
// The page end of the bridge channel, open only while the overlay is: agent results arrive
// by themselves, and the agent's checks get answers from this page.

import type { Numbered } from '../core/feed'
import { issueState } from '../core/review'
import { refreshResults, say } from './exporting'
import type { Runtime } from './runtime'

const RETRY_MS = 5000
/** States that wait for the person: a result to check or a question to answer. */
const TO_CHECK = new Set(['needs-review', 'partial', 'blocked'])

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      done()
    }, { once: true })
  })
}

async function results(rt: Runtime, batchId: string) {
  const batch = rt.engine.session.store.get().submitted.find(b => b.id === batchId)
  if (!batch) return
  await refreshResults(rt, batchId)
  const followUps = rt.engine.session.store.get().followUps[batchId] ?? []
  const count = batch.issues.filter(i => TO_CHECK.has(issueState(followUps, i.id))).length
  if (count) say(rt, rt.t('bridge.toCheck', { count }))
}

async function answer(rt: Runtime, e: Extract<Numbered, { kind: 'check' }>) {
  const bridge = rt.engine.bridge!
  const r = e.request
  if (r.kind === 'selection') return bridge.answer(e.id, await rt.engine.describeSelection())
  // A batch sent from another browser is not stored here; the bridge has it.
  const issue = rt.engine.session.store.get().submitted.find(b => b.id === r.batchId)?.issues.find(i => i.id === r.issueId)
    ?? (await bridge.batch(r.batchId))?.issues.find(i => i.id === r.issueId)
  return bridge.answer(e.id, issue ? rt.engine.check(issue) : { status: 'unknown' })
}

/** Starts listening; the returned function stops it, ending the open request too. */
export function startFeed(rt: Runtime): () => void {
  const bridge = rt.engine.bridge
  if (!bridge) return () => {}
  const stop = new AbortController()
  const { signal } = stop
  void (async () => {
    let after: number | null = null
    while (!signal.aborted) {
      const res = await bridge.next(after, signal)
      if (signal.aborted) return
      if (!res) {
        rt.ui.bridge = 'offline'
        after = null
        await pause(RETRY_MS, signal)
        continue
      }
      rt.ui.bridge = 'connected'
      after = res.seq
      for (const e of res.events) {
        if (e.kind === 'results' && e.actor === 'agent') void results(rt, e.batchId)
        else if (e.kind === 'check') void answer(rt, e)
      }
    }
  })()
  return () => stop.abort()
}
