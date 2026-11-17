// src/bridge/work.ts
// What waits for an agent, with what it needs to begin, and the long-poll that wakes when it changes.

import type { CaptureConditions, Issue, Scope } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { intentSentence, targetText } from '../core/task'
import type { Feed } from './feed'
import type { Store } from './store'

/** An issue waits for an agent while nobody answered it, or one began it and may have gone. */
export type OpenState = 'submitted' | 'in-progress'

const isOpen = (state: string): state is OpenState => state === 'submitted' || state === 'in-progress'

/** An issue sent and not yet answered by an agent: enough to begin without another call. */
export interface WorkItem {
  batch_id: string
  issue_id: string
  /** `in-progress`: an agent began it and went quiet, so it is open again. */
  state: OpenState
  seq: number
  preset: string
  /** What to do, as task.md says it. */
  task: string
  /** The person's words, verbatim and untrusted. */
  note: string
  scope: Scope
  /** A, the element to change. */
  target: string
  /** A's component file relative to the bridge root, when the page knew it; for a group its main member's. */
  source: string | null
  /** A group's member files, each once, when the page knew them; null for one element. */
  files: string[] | null
  /** The conditions the person saw it under, which decide a responsive layout. */
  viewport: CaptureConditions['viewport']
  colorScheme: CaptureConditions['colorScheme']
  /** How many approved images the person attached; get_batch lists them. */
  images: number
}

interface Open {
  batchId: string
  state: OpenState
  images: number
}

function filesOf(issue: Issue): string[] | null {
  const sources = issue.evidence.a.memberSources
  if (!sources) return null
  return [...new Set(sources.flatMap(({ file }) => file ? [file] : []))]
}

function itemOf(issue: Issue, registry: PresetRegistry, open: Open): WorkItem {
  return {
    batch_id: open.batchId,
    issue_id: issue.id,
    state: open.state,
    seq: issue.seq,
    preset: issue.intent.preset.id,
    task: intentSentence(issue, registry),
    note: issue.intent.note,
    scope: issue.intent.scope,
    target: targetText(issue.operands.a),
    source: issue.evidence.a.source.file ?? null,
    files: filesOf(issue),
    viewport: issue.evidence.capture.viewport,
    colorScheme: issue.evidence.capture.colorScheme,
    images: open.images,
  }
}

/** Oldest batch first, issues in their order; who may take each is the caller's to decide. */
export async function listWork(store: Store, registry: PresetRegistry): Promise<WorkItem[]> {
  const out: WorkItem[] = []
  for (const summary of (await store.listBatches()).reverse()) {
    const open = new Map<string, OpenState>()
    for (const { id, state } of summary.issues) if (isOpen(state)) open.set(id, state)
    if (!open.size) continue
    const batch = await store.getBatch(summary.id)
    const images = await store.images(summary.id)
    for (const issue of batch?.issues ?? []) {
      const state = open.get(issue.id)
      const count = images.get(issue.id)?.length ?? 0
      if (state) out.push(itemOf(issue, registry, { batchId: summary.id, state, images: count }))
    }
  }
  return out
}

/** Recomputes on every change until there is something, the wait ends or the client goes away. */
export async function until<T>(
  feed: Feed,
  compute: () => Promise<T[]>,
  ms: number,
  signal: AbortSignal,
): Promise<T[]> {
  const end = Date.now() + ms
  let value = await compute()
  while (!value.length && Date.now() < end && !signal.aborted) {
    await feed.next(end - Date.now(), signal)
    value = await compute()
  }
  return value
}
