// src/bridge/feed.ts
// What changed, in order: the page's long-poll reads it, and waiting work requests wake on it.

import { randomBytes } from 'node:crypto'
import type { CheckRequest, FeedEvent, Numbered } from '../core/feed'

/** How long a page that stopped polling still counts as open. */
const PAGE_GONE_MS = 30_000
/** After an answer from a page where the target is not live, how long a better one may still come. */
const GRACE_MS = 1500
const ASK_MS = 15_000

export function createFeed(limit = 200) {
  const events: Numbered[] = []
  let seq = 0
  const waiters = new Set<() => void>()

  function emit(e: FeedEvent) {
    events.push({ ...e, seq: ++seq })
    if (events.length > limit) events.shift()
    for (const wake of [...waiters]) wake()
  }

  return {
    get seq() {
      return seq
    },
    emit,
    since: (after: number) => events.filter(e => e.seq > after),
    /** Settles on the next event, after `ms`, or when `signal` aborts, whichever is first. */
    next(ms: number, signal: AbortSignal): Promise<void> {
      return new Promise((done) => {
        const finish = () => {
          clearTimeout(timer)
          waiters.delete(finish)
          signal.removeEventListener('abort', finish)
          done()
        }
        const timer = setTimeout(finish, ms)
        waiters.add(finish)
        signal.addEventListener('abort', finish, { once: true })
      })
    },
  }
}

export type Feed = ReturnType<typeof createFeed>

const live = (value: unknown) => (value as { status?: unknown } | null)?.status === 'live'

/** Questions for the open page. Every open tab answers; the one where the target is live wins. */
export function createChecks(feed: Feed) {
  const pending = new Map<string, (value: unknown) => void>()
  let polling = 0
  let lastPoll = 0

  return {
    /** Wraps one page poll, so a page that is waiting right now counts as open. */
    async polled<T>(work: () => Promise<T>): Promise<T> {
      polling++
      try {
        return await work()
      }
      finally {
        polling--
        lastPoll = Date.now()
      }
    },
    connected: () => polling > 0 || Date.now() - lastPoll < PAGE_GONE_MS,
    /** The best answer from the open pages, or null when none came in time. */
    ask(request: CheckRequest): Promise<unknown> {
      const id = `chk_${randomBytes(9).toString('hex')}`
      return new Promise((done) => {
        const answers: unknown[] = []
        let grace: ReturnType<typeof setTimeout> | undefined
        const finish = (value: unknown) => {
          clearTimeout(timer)
          clearTimeout(grace)
          pending.delete(id)
          done(value)
        }
        const timer = setTimeout(() => finish(answers[0] ?? null), ASK_MS)
        pending.set(id, (value) => {
          answers.push(value)
          if (live(value)) finish(value)
          else if (answers.length === 1) grace = setTimeout(() => finish(answers[0]), GRACE_MS)
        })
        feed.emit({ kind: 'check', id, request })
      })
    },
    answer(id: string, value: unknown): boolean {
      const take = pending.get(id)
      take?.(value)
      return !!take
    },
  }
}
