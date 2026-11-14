// src/bridge/store.ts
// The one writer of a project's .smegglect/ directory: atomic files, ids as the only path parts.

import { randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { Batch, FollowUp, Issue } from '../core/model'
import type { PresetRegistry } from '../core/presets'
import { allowedState, issueState, type IssueState } from '../core/review'
import { scrub } from '../core/redact'
import { canonicalJson } from '../core/task'
import { checkBatch, isId, LIMITS } from '../core/validate'

export const ATTACHMENT_LIMIT = 5 * 1024 * 1024
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export type Put = 'stored' | 'duplicate' | 'conflict' | 'invalid' | 'missing'

export interface BatchSummary {
  id: string
  project: string
  submittedAt?: string
  issues: { id: string, seq: number, preset: string, state: IssueState }[]
}

export class StoreError extends Error {}

export async function openStore(projectRoot: string, registry: PresetRegistry) {
  const base = join(await realpath(projectRoot), '.smegglect')
  await mkdir(join(base, 'batches'), { recursive: true, mode: 0o700 })
  const root = await realpath(base)

  /** Path from validated ids only, verified to stay under the store and free of symlinks. */
  async function path(...parts: string[]): Promise<string> {
    for (const p of parts) if (!isId(p) && !/^[A-Za-z0-9_-]{1,64}\.(json|png|jpg|webp)$/.test(p)) throw new StoreError(`invalid path part ${JSON.stringify(p)}`)
    const full = join(root, 'batches', ...parts)
    if (!full.startsWith(root + sep)) throw new StoreError('path escapes the store')
    let cur = root
    for (const p of ['batches', ...parts.slice(0, -1)]) {
      cur = join(cur, p)
      const st = await lstat(cur).catch(() => null)
      if (st?.isSymbolicLink()) throw new StoreError('symlink in store path')
    }
    return full
  }

  async function atomic(file: string, data: string | Uint8Array) {
    const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, data, { mode: 0o600, flag: 'wx' })
    await rename(tmp, file)
  }

  async function read<T>(file: string): Promise<T | null> {
    const st = await lstat(file).catch(() => null)
    if (!st || st.isSymbolicLink() || !st.isFile()) return null
    return JSON.parse(await readFile(file, 'utf8')) as T
  }

  async function getBatch(id: string): Promise<Batch | null> {
    if (!isId(id)) return null
    return read<Batch>(await path(id, 'batch.json'))
  }

  async function followUps(id: string): Promise<FollowUp[]> {
    if (!isId(id)) return []
    const dir = await path(id, 'followups')
    const names = await readdir(dir).catch(() => [] as string[])
    const out: FollowUp[] = []
    for (const n of names.filter(n => n.endsWith('.json'))) {
      const f = await read<FollowUp>(await path(id, 'followups', n))
      if (f) out.push(f)
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  return {
    root,
    async putBatch(input: unknown): Promise<Put> {
      const checked = checkBatch(input, registry)
      if (!checked.ok || checked.value.status !== 'submitted') return 'invalid'
      const batch = scrub(checked.value)
      const file = await path(batch.id, 'batch.json')
      const cur = await read<Batch>(file)
      if (cur) return canonicalJson(cur) === canonicalJson(batch) ? 'duplicate' : 'conflict'
      await mkdir(await path(batch.id), { recursive: true, mode: 0o700 })
      await mkdir(await path(batch.id, 'followups'), { recursive: true, mode: 0o700 })
      await atomic(file, canonicalJson(batch))
      return 'stored'
    },
    getBatch,
    followUps,
    async listBatches(): Promise<BatchSummary[]> {
      const ids = (await readdir(join(root, 'batches')).catch(() => [] as string[])).filter(isId)
      const out: BatchSummary[] = []
      for (const id of ids) {
        // A symlinked or unreadable entry is skipped, never followed and never fatal for the listing.
        const b = await getBatch(id).catch(() => null)
        if (!b) continue
        const f = await followUps(id)
        out.push({
          id: b.id,
          project: b.project.id,
          ...(b.submittedAt ? { submittedAt: b.submittedAt } : {}),
          issues: b.issues.map(i => ({ id: i.id, seq: i.seq, preset: i.intent.preset.id, state: issueState(f, i.id) })),
        })
      }
      return out.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
    },
    async issue(batchId: string, issueId: string): Promise<{ batch: Batch, issue: Issue, followUps: FollowUp[], state: IssueState } | null> {
      const b = await getBatch(batchId)
      const issue = b?.issues.find(i => i.id === issueId)
      if (!b || !issue) return null
      const f = (await followUps(batchId)).filter(x => x.issueId === issueId)
      return { batch: b, issue, followUps: f, state: issueState(f, issueId) }
    },
    /** Appends; the same id with the same content is a no-op, with other content a conflict. */
    async addFollowUp(input: FollowUp): Promise<Put> {
      if (!isId(input.id) || !isId(input.batchId) || !isId(input.issueId)) return 'invalid'
      if (typeof input.text !== 'string' || input.text.length > LIMITS.note || !allowedState(input)) return 'invalid'
      if (input.files && (!Array.isArray(input.files) || input.files.length > 50 || input.files.some(p => typeof p !== 'string' || p.startsWith('/') || p.includes('..') || p.length > 256))) return 'invalid'
      if (input.checks && (!Array.isArray(input.checks) || input.checks.length > 20)) return 'invalid'
      const b = await getBatch(input.batchId)
      if (!b || !b.issues.some(i => i.id === input.issueId)) return 'missing'
      const f = scrub(input)
      const file = await path(f.batchId, 'followups', `${f.id}.json`)
      const cur = await read<FollowUp>(file)
      if (cur) return canonicalJson(cur) === canonicalJson(f) ? 'duplicate' : 'conflict'
      await atomic(file, canonicalJson(f))
      return 'stored'
    },
    async putAttachment(batchId: string, attId: string, mime: string, bytes: Uint8Array): Promise<Put> {
      const b = await getBatch(batchId)
      const a = b?.attachments.find(x => x.id === attId)
      if (!b || !a) return 'missing'
      if (a.review !== 'approved' || a.mime !== mime || !EXT[mime] || bytes.length > ATTACHMENT_LIMIT || bytes.length !== a.size) return 'invalid'
      await mkdir(await path(batchId, 'attachments'), { recursive: true, mode: 0o700 })
      const file = await path(batchId, 'attachments', `${attId}.${EXT[mime]}`)
      if (await lstat(file).catch(() => null)) return 'duplicate'
      await atomic(file, bytes)
      return 'stored'
    },
    async attachment(batchId: string, attId: string): Promise<{ mime: string, bytes: Buffer } | null> {
      const b = await getBatch(batchId)
      const a = b?.attachments.find(x => x.id === attId)
      if (!b || !a || !EXT[a.mime]) return null
      const file = await path(batchId, 'attachments', `${attId}.${EXT[a.mime]}`)
      const st = await lstat(file).catch(() => null)
      if (!st || !st.isFile()) return null
      return { mime: a.mime, bytes: await readFile(file) }
    },
  }
}

export type Store = Awaited<ReturnType<typeof openStore>>
