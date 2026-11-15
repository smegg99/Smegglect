// src/dom/session/claim.ts
// A window new to its tab takes the drafts last saved for the project when no open window holds them: a
// desktop app that restarts, or a tab opened again, finds its issues. A window beside another keeps its own.

import { forkWindow, lastWindow } from '../storage'
import { patch, type SessionContext } from './context'

/** How long an open window has to say it holds the drafts. */
const ANSWER_MS = 150

interface Claim {
  /** Asked by a new window: does anyone hold this window's drafts? */
  ask?: string
  /** The answer of the window that does. */
  mine?: string
}

/** Every window answers for the drafts it holds, for as long as the overlay runs. */
function answerClaims(context: SessionContext): BroadcastChannel | null {
  const { win, scope } = context.options
  if (typeof win.BroadcastChannel !== 'function') return null
  const channel = new win.BroadcastChannel(`smegglect:${context.project}`)
  scope.add(() => channel.close())
  scope.listen(channel, 'message', (event) => {
    const asked = ((event as MessageEvent).data as Claim | null)?.ask
    if (asked && asked === context.store.get().windowId) channel.postMessage({ mine: asked } satisfies Claim)
  })
  return channel
}

/** Whether an open window answers for these drafts in time. */
function held(channel: BroadcastChannel, id: string, win: Window): Promise<boolean> {
  return new Promise((done) => {
    const heard = (event: MessageEvent) => {
      if ((event.data as Claim | null)?.mine === id) finish(true)
    }
    const timer = win.setTimeout(() => finish(false), ANSWER_MS)
    function finish(answer: boolean) {
      win.clearTimeout(timer)
      channel.removeEventListener('message', heard)
      done(answer)
    }
    channel.addEventListener('message', heard)
    channel.postMessage({ ask: id } satisfies Claim)
  })
}

/** Settles which window this tab is before its drafts are read. */
export async function claimWindow(context: SessionContext): Promise<void> {
  const { win } = context.options
  const channel = answerClaims(context)
  const last = lastWindow(win, context.project)
  const own = context.store.get().windowId
  // Without a channel no window can answer; two taking the same drafts fork on their next save.
  if (context.fresh && last && last !== own && !(channel && await held(channel, last, win))) {
    patch(context, { windowId: last })
  }
  forkWindow(win, context.project, context.store.get().windowId)
}
