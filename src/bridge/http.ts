// src/bridge/http.ts
// The broker's HTTP pieces: a refusal with a status, bounded bodies, JSON in and out.

import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const JSON_LIMIT = 2 * 1024 * 1024
/** The longest a long-poll is held open, in seconds. */
const MAX_WAIT_S = 50

/** A refusal: the client receives `{ error: code }` with the status. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

/** `?wait=<seconds>`, at most 50, for long-polling clients. */
export function waitMs(url: URL): number {
  const seconds = Number(url.searchParams.get('wait') ?? 0)
  if (!Number.isFinite(seconds)) return 0
  return Math.min(Math.max(seconds, 0), MAX_WAIT_S) * 1000
}

/** Compares in constant time, so the token cannot be found one character at a time. */
export function sameSecret(given: string, expected: string): boolean {
  const left = Buffer.from(given)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** The body, refused as soon as it passes `limit`, declared or not. */
export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, 'too-large')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'too-large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? ''
  if (!type.startsWith('application/json')) throw new HttpError(415, 'json-only')
  try {
    return JSON.parse((await readBody(req, JSON_LIMIT)).toString('utf8'))
  }
  catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'bad-json')
  }
}
