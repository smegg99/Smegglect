// src/dom/session/index.ts
// Persistence and submission around the one draft queue: save, restore, freeze, follow up, export.
// Each part has its own file; they share one context object (context.ts).

import { approve, attach, detach, preview } from './attachments'
import { addFollowUp, bundle, deleteBatch, draftBatch, files, markdown, submit } from './batches'
import { createContext, patch } from './context'
import { clearStored, discardStored, log } from './history'
import { init, save } from './persist'
import type { Session, SessionOptions } from './types'

export type {
  AttachResult, Bundle, Session, SessionState, StorageStatus, SubmitResult,
} from './types'

export function createSession(options: SessionOptions): Session {
  const context = createContext(options)
  const { store } = context
  const ready = init(context).catch((error: unknown) => {
    options.onError(error)
    patch(context, { status: { kind: 'failed', error: 'failed' } })
  })
  return {
    store,
    ready,
    changed: () => void save(context),
    draftBatch: () => draftBatch(context),
    submit: () => submit(context),
    markdown: batch => markdown(context, batch),
    bundle: batch => bundle(context, batch),
    deleteBatch: id => deleteBatch(context, id),
    addFollowUp: input => addFollowUp(context, input),
    attach: (issueId, file, name) => attach(context, issueId, file, name),
    approve: id => approve(context, id),
    detach: id => detach(context, id),
    preview: id => preview(context, id),
    files: batch => files(context, batch),
    log: input => log(context, input),
    markShared(ids) {
      const shared = { ...store.get().shared }
      for (const id of ids) shared[id] = true
      patch(context, { shared })
    },
    clearStored: () => clearStored(context),
    discardStored: () => discardStored(context),
  }
}
