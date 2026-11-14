// src/core/feed.ts
// Wire types of the bridge's page channel, shared by the broker and the page.

export type CheckRequest =
  | { kind: 'issue', batchId: string, issueId: string }
  | { kind: 'selection' }

export type FeedEvent =
  | { kind: 'batch', batchId: string }
  /** An agent came, listened, took a batch or went quiet: the page asks for the status again. */
  | { kind: 'status' }
  /** An agent recorded a result. */
  | { kind: 'results', batchId: string }
  /** `to`: the pages asked, best first; no other page receives it. */
  | { kind: 'check', id: string, request: CheckRequest, to: string[] }

export type Numbered = FeedEvent & { seq: number }

/** What a page says about itself with each poll of the page channel. */
export interface PagePoll {
  /** The page's window id, the one stored with the batches it sends. */
  id: string
  visible: boolean
  focused: boolean
  /** Never asked to answer an agent's checks, e.g. a browser an automation opened. */
  observer: boolean
  /** The overlay's package version and the page's viewport, for the agent's view of the link. */
  version?: string
  viewport?: { width: number, height: number }
}
