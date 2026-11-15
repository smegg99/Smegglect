// src/bridge/store-files.ts
// The store's files: paths built from ids only, each file created once and whole, temporary files swept.

import { randomBytes } from 'node:crypto'
import { link, lstat, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { ATTACHMENT_EXTENSIONS } from '../core/attachments'
import { ID_BODY, isId } from '../core/limits'

/** A file name the store writes: an id and one of its own extensions. */
const FILE_NAME = new RegExp(`^${ID_BODY}\\.(json|${Object.values(ATTACHMENT_EXTENSIONS).join('|')})$`)
/** A file being written: the name it gets, a random part and `.tmp`. */
const TEMPORARY = /\.[0-9a-f]+\.tmp$/
/** A temporary file older than this belongs to no write still going on. */
const LEFTOVER_MS = 60_000

export class StoreError extends Error {}

/** Path from validated ids only, verified to stay under the store and free of symlinks. */
export async function storePath(root: string, ...parts: string[]): Promise<string> {
  for (const part of parts) {
    if (isId(part) || FILE_NAME.test(part)) continue
    throw new StoreError(`invalid path part ${JSON.stringify(part)}`)
  }
  const full = join(root, 'batches', ...parts)
  if (!full.startsWith(root + sep)) throw new StoreError('path escapes the store')
  let walked = root
  for (const part of ['batches', ...parts.slice(0, -1)]) {
    walked = join(walked, part)
    const stat = await lstat(walked).catch(() => null)
    if (stat?.isSymbolicLink()) throw new StoreError('symlink in store path')
  }
  return full
}

const exists = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EEXIST'

/** Creates the file whole, from a temporary file linked into place; false when the file is already there. */
export async function writeOnce(file: string, data: string | Uint8Array): Promise<boolean> {
  const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, data, { mode: 0o600, flag: 'wx' })
  try {
    await link(temporary, file)
    return true
  }
  catch (error) {
    if (exists(error)) return false
    throw error
  }
  finally {
    await rm(temporary, { force: true })
  }
}

/** A file's JSON; null when it is absent, a symlink, not a file, or not JSON. */
export async function readRecord(file: string): Promise<unknown> {
  const stat = await lstat(file).catch(() => null)
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return null
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  }
  catch {
    // Unreadable or not JSON: the store did not write it, so it reads as absent.
    return null
  }
}

/** The store's own directories, never through a symlink: its root, and each batch's. */
async function directories(root: string): Promise<string[]> {
  const batches = join(root, 'batches')
  const out = [root, batches]
  for (const id of (await readdir(batches).catch(() => [] as string[])).filter(isId)) {
    const dir = join(batches, id)
    const stat = await lstat(dir).catch(() => null)
    if (stat?.isDirectory()) out.push(dir, join(dir, 'followups'), join(dir, 'attachments'))
  }
  return out
}

/** Removes the temporary files a broker that stopped mid-write left behind. */
export async function sweepTemporary(root: string): Promise<void> {
  const before = Date.now() - LEFTOVER_MS
  for (const dir of await directories(root)) {
    if (!(await lstat(dir).catch(() => null))?.isDirectory()) continue
    for (const name of (await readdir(dir)).filter(name => TEMPORARY.test(name))) {
      const stat = await lstat(join(dir, name)).catch(() => null)
      if (stat?.isFile() && stat.mtimeMs < before) await rm(join(dir, name), { force: true })
    }
  }
}
