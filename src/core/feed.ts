// src/core/feed.ts
// Wire types of the bridge's page channel, shared by the broker and the page.

export type CheckRequest =
  | { kind: 'issue', batchId: string, issueId: string }
  | { kind: 'selection' }

export type FeedEvent =
  | { kind: 'batch', batchId: string }
  | { kind: 'results', batchId: string, actor: 'agent' | 'human' }
  | { kind: 'check', id: string, request: CheckRequest }

export type Numbered = FeedEvent & { seq: number }
