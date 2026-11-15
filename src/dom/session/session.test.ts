// src/dom/session/session.test.ts
import { describe, expect, it } from 'vitest'
import { emptyDrafts, type Drafts } from '../../core/drafts'
import { createRegistry } from '../../core/presets'
import { issue } from '../../core/validate.test'
import { createScope } from '../scope'
import { memoryStorage, type DraftStorage } from '../storage'
import type { HostWindow } from '../window'
import { submit } from './batches'
import { createContext, recordKey, type SessionContext } from './context'
import { save } from './persist'

/** A storage call held until the test lets it go. */
function gate(): { wait: Promise<void>, open: () => void } {
  let open = () => {}
  const wait = new Promise<void>((done) => {
    open = done
  })
  return { wait, open }
}

/** A session over `storage` whose drafts live in `holder.drafts`, as the engine's store holds them. */
function session(storage: DraftStorage, holder: { drafts: Drafts }): SessionContext {
  // No browser storage: each window id is new, and nothing is remembered.
  const win = {} as HostWindow
  return createContext({
    win,
    project: { id: 'demo' },
    storage,
    registry: createRegistry(),
    scope: createScope(win),
    drafts: () => holder.drafts,
    setDrafts: (drafts) => {
      holder.drafts = drafts
    },
    onError: (error) => {
      throw error
    },
  })
}

describe('saving', () => {
  it('shares the running save, and settles only once the latest drafts are written', async () => {
    const base = memoryStorage()
    const held = gate()
    let calls = 0
    const storage: DraftStorage = {
      ...base,
      async saveDraft(record, expected) {
        calls++
        if (calls === 1) await held.wait
        return base.saveDraft(record, expected)
      },
    }
    const holder = { drafts: emptyDrafts() }
    const context = session(storage, holder)
    const first = save(context)
    holder.drafts = { ...emptyDrafts(), issues: [issue({ id: 'iss_one' })] }
    const second = save(context)
    expect(second).toBe(first)
    held.open()
    await second
    expect(calls).toBe(2)
    const stored = await base.loadDraft(recordKey(context))
    expect(stored.ok && stored.value?.issues.map(draft => draft.id)).toEqual(['iss_one'])
  })
})

describe('submitting', () => {
  it('takes only the sent issues out of the drafts; one added while it was stored stays', async () => {
    const base = memoryStorage()
    const held = gate()
    const storage: DraftStorage = {
      ...base,
      async putBatch(batch) {
        await held.wait
        return base.putBatch(batch)
      },
    }
    const holder = { drafts: { ...emptyDrafts(), issues: [issue({ id: 'iss_one', seq: 1 })] } }
    const context = session(storage, holder)
    const sending = submit(context)
    holder.drafts = { ...holder.drafts, issues: [...holder.drafts.issues, issue({ id: 'iss_two', seq: 2 })] }
    held.open()
    expect((await sending).ok).toBe(true)
    expect(holder.drafts.issues.map(draft => [draft.id, draft.seq])).toEqual([['iss_two', 1]])
  })

  it('lists a batch stored twice once', async () => {
    const base = memoryStorage()
    const held = gate()
    const storage: DraftStorage = {
      ...base,
      async putBatch(batch) {
        await held.wait
        return base.putBatch(batch)
      },
    }
    const holder = { drafts: { ...emptyDrafts(), issues: [issue({ id: 'iss_one' })] } }
    const context = session(storage, holder)
    const twice = [submit(context), submit(context)]
    held.open()
    const results = await Promise.all(twice)
    expect(results.map(result => result.ok)).toEqual([true, true])
    expect(context.store.get().submitted.map(batch => batch.id)).toHaveLength(1)
  })
})
