// src/bridge/feed.ts
// What changed, in order: the page's long-poll reads it, and waiting work requests wake on it.
// Checks go to the open pages in order: the page that sent the batch, a visible focused one, the rest.

import { randomBytes } from 'node:crypto'
import type { CheckRequest, FeedEvent, Numbered, PagePoll } from '../core/feed'

/** How long a page that stopped polling still counts as open. */
const PAGE_GONE_MS = 30_000
/** A page that polled this recently is asked; one silent for longer is not waited for. */
const PAGE_AWAKE_MS = 5_000
const ASK_MS = 15_000

/** The events since the broker started, numbered, the newest kept. */
export interface Feed {
  /** The number of the newest event. */
  readonly seq: number
  emit: (event: FeedEvent) => void
  since: (after: number) => Numbered[]
  /** Settles on the next event, after `ms`, or when `signal` aborts, whichever is first. */
  next: (ms: number, signal: AbortSignal) => Promise<void>
}

/** A page's answer, and which page gave it. */
interface PageAnswer {
  value: unknown
  page: string
}

/** Questions for the open pages and their answers. */
export interface Checks {
  /**
   * Wraps one poll of a page, which counts as open while it waits and for a while after; a poll the page
   * abandoned (a closed tab, a reload) means it is gone, so it is not asked and waited for.
   */
  polled: <T>(page: PagePoll, signal: AbortSignal, work: () => Promise<T>) => Promise<T>
  /** An open page that may be asked: one that is not an observer. */
  connected: () => boolean
  /** The best answer from the open pages, `sender` first; null when none came in time. */
  ask: (request: CheckRequest, sender?: string) => Promise<PageAnswer | null>
  /** False when no question has that id, or it was not put to that page. */
  answer: (id: string, page: string, value: unknown) => boolean
  /** The open pages that may be asked, as they last described themselves. */
  pages: () => PagePoll[]
}

export function createFeed(limit = 200): Feed {
  const events: Numbered[] = []
  let seq = 0
  const waiters = new Set<() => void>()

  return {
    get seq() {
      return seq
    },
    emit(event) {
      events.push({ ...event, seq: ++seq })
      if (events.length > limit) events.shift()
      for (const wake of [...waiters]) wake()
    },
    since: after => events.filter(event => event.seq > after),
    next(ms, signal) {
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

const live = (value: unknown) => (value as { status?: unknown } | null)?.status === 'live'

interface OpenPage {
  poll: PagePoll
  polling: number
  lastSeen: number
}

/** The pages to ask, best first: the sender, then visible and focused, then visible, then the rest. */
function ranked(pages: Map<string, OpenPage>, sender: string | undefined): string[] {
  const now = Date.now()
  const awake = [...pages.values()]
    .filter(page => !page.poll.observer && (page.polling > 0 || now - page.lastSeen < PAGE_AWAKE_MS))
  const rank = (page: OpenPage) => {
    if (page.poll.id === sender) return 0
    if (page.poll.visible && page.poll.focused) return 1
    return page.poll.visible ? 2 : 3
  }
  return awake.sort((a, b) => rank(a) - rank(b)).map(page => page.poll.id)
}

/**
 * One question: settles with a live answer once every page ranked above it has answered, else with the
 * best answer when all have, else with the best received when time is up.
 */
function question(order: string[], done: (answer: PageAnswer | null) => void) {
  const answers = new Map<string, unknown>()
  const best = (): PageAnswer | null => {
    const liveOne = order.find(id => answers.has(id) && live(answers.get(id)))
    const page = liveOne ?? order.find(id => answers.has(id))
    return page === undefined ? null : { value: answers.get(page), page }
  }
  const timer = setTimeout(() => done(best()), ASK_MS)
  return {
    asked: (page: string) => order.includes(page),
    take(page: string, value: unknown) {
      answers.set(page, value)
      const firstLive = order.findIndex(id => answers.has(id) && live(answers.get(id)))
      const settledAbove = firstLive >= 0 && order.slice(0, firstLive).every(id => answers.has(id))
      if (!settledAbove && answers.size < order.length) return
      clearTimeout(timer)
      done(best())
    },
  }
}

/** Pages that may be asked: polling now or a moment ago, and no observer. */
function open(pages: Map<string, OpenPage>): OpenPage[] {
  const now = Date.now()
  return [...pages.values()]
    .filter(page => !page.poll.observer && (page.polling > 0 || now - page.lastSeen < PAGE_GONE_MS))
}

/** Forgets the pages gone for good: a closed tab, a reload, a window that stopped polling. */
function forgetGone(pages: Map<string, OpenPage>): void {
  const now = Date.now()
  for (const [id, page] of pages) {
    if (page.polling === 0 && now - page.lastSeen >= PAGE_GONE_MS) pages.delete(id)
  }
}

export function createChecks(feed: Feed): Checks {
  const pages = new Map<string, OpenPage>()
  const pending = new Map<string, ReturnType<typeof question>>()

  return {
    async polled(poll, signal, work) {
      forgetGone(pages)
      const page = pages.get(poll.id) ?? { poll, polling: 0, lastSeen: 0 }
      page.poll = poll
      page.polling++
      pages.set(poll.id, page)
      try {
        return await work()
      }
      finally {
        page.polling--
        page.lastSeen = signal.aborted ? 0 : Date.now()
      }
    },
    connected: () => open(pages).length > 0,
    ask(request, sender) {
      const id = `chk_${randomBytes(9).toString('hex')}`
      const order = ranked(pages, sender)
      if (!order.length) return Promise.resolve(null)
      return new Promise((done) => {
        pending.set(id, question(order, (answer) => {
          pending.delete(id)
          done(answer)
        }))
        feed.emit({ kind: 'check', id, request, to: order })
      })
    },
    answer(id, page, value) {
      const open = pending.get(id)
      if (!open?.asked(page)) return false
      open.take(page, value)
      return true
    },
    pages: () => open(pages).map(page => page.poll),
  }
}
