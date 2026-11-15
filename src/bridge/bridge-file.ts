// src/bridge/bridge-file.ts
// The running broker's address and token in `<project>/.smegglect/bridge.json`: one writer and one reader.

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const BRIDGE_FILE = 'bridge.json'

/** What a broker writes for the processes and pages that call it. */
export interface BridgeFile {
  url: string
  token: string
  pid?: number
}

const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d+$/

/** The file's contents when they name a broker on loopback, else null. */
function parseBridgeFile(raw: unknown): BridgeFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { url, token, pid } = raw as Record<string, unknown>
  if (typeof url !== 'string' || !LOOPBACK_URL.test(url) || typeof token !== 'string') return null
  return { url, token, pid: typeof pid === 'number' ? pid : undefined }
}

/** The broker's file for a project folder; null when there is none or it cannot be read. */
export function readBridgeFile(projectRoot: string): BridgeFile | null {
  try {
    const text = readFileSync(join(projectRoot, '.smegglect', BRIDGE_FILE), 'utf8')
    return parseBridgeFile(JSON.parse(text))
  }
  catch {
    // Missing or half-written: there is no broker to reach, and the caller says so.
    return null
  }
}

/** Written atomically and readable by its owner only, since it holds the token. Returns its path. */
export async function writeBridgeFile(storeRoot: string, file: BridgeFile): Promise<string> {
  const path = join(storeRoot, BRIDGE_FILE)
  const temporary = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temporary, JSON.stringify(file), { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
  return path
}

/** Removes the file unless a broker started later for the same project has replaced it. */
export async function removeBridgeFile(path: string, token: string): Promise<void> {
  const current = await readFile(path, 'utf8').then(
    text => parseBridgeFile(JSON.parse(text))?.token,
    () => null,
  )
  if (current === token) await rm(path, { force: true })
}
