// src/bridge/client.ts
// How the MCP process reaches the broker: the address and token the running broker wrote, read per call.

import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

export class Disconnected extends Error {}

export interface BrokerClient {
  get: <T>(path: string) => Promise<{ status: number, body: T }>
  post: <T>(path: string, value: unknown) => Promise<{ status: number, body: T }>
}

async function info(root: string): Promise<{ url: string, token: string }> {
  try {
    const raw = JSON.parse(await readFile(join(await realpath(root), '.smegglect', 'bridge.json'), 'utf8')) as { url?: unknown, token?: unknown }
    if (typeof raw.url !== 'string' || typeof raw.token !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(raw.url)) throw new Error('bad')
    return { url: raw.url, token: raw.token }
  }
  catch {
    throw new Disconnected('the Smegglect bridge is not running for this project')
  }
}

export function brokerClient(root: string): BrokerClient {
  async function call<T>(method: string, path: string, value?: unknown) {
    const { url, token } = await info(root)
    let res: Response
    try {
      res = await fetch(`${url}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(value === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      })
    }
    catch {
      throw new Disconnected('the Smegglect bridge did not answer')
    }
    return { status: res.status, body: await res.json() as T }
  }
  return {
    get: path => call('GET', path),
    post: (path, value) => call('POST', path, value),
  }
}
