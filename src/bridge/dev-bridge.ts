// src/bridge/dev-bridge.ts
// The bridge a dev server gives its page: the broker already running for the project when it answers,
// else one the dev server starts and closes. Both adapters, Vite and Nuxt, call this.

import { type BridgeFile, readBridgeFile } from './bridge-file'

/** What the page is given to reach the broker. */
export interface BridgeLink {
  url: string
  token: string
}

export interface DevBridge {
  link: BridgeLink
  /** Closes the broker when this dev server started it; one it found running stays. */
  close: () => Promise<void>
}

export interface DevBridgeLog {
  info: (line: string) => void
  warn: (line: string) => void
}

/** Whether the broker named in the bridge file is up and holds that token. */
async function answers(file: BridgeFile): Promise<boolean> {
  try {
    const res = await fetch(`${file.url}/v1/health`, {
      headers: { authorization: `Bearer ${file.token}` },
      signal: AbortSignal.timeout(1000),
    })
    return res.ok
  }
  catch {
    // Refused or timed out: the file is left from a broker that is gone.
    return false
  }
}

/** Admits this dev server's pages to a broker another dev server started; false when it refused. */
async function admit(file: BridgeFile, origins: readonly string[]): Promise<boolean> {
  try {
    const res = await fetch(`${file.url}/v1/origins`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${file.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ origins }),
      signal: AbortSignal.timeout(1000),
    })
    return res.ok
  }
  catch {
    // It answered a moment ago; a broker that stops now is found gone on the page's first call.
    return false
  }
}

/** The loopback origins of a dev server on `port`; localhost and 127.0.0.1 are the same server. */
export function loopbackOrigins(port: number, protocol = 'http:'): string[] {
  return ['127.0.0.1', 'localhost'].map(host => `${protocol}//${host}:${port}`)
}

/** Null when no broker could be found or started; the dev server goes on without one. */
export async function devBridge(
  root: string,
  origins: readonly string[],
  log: DevBridgeLog,
): Promise<DevBridge | null> {
  const known = readBridgeFile(root)
  if (known && await answers(known)) {
    log.info(`smegglect: using the agent bridge at ${known.url}`)
    if (!await admit(known, origins)) {
      log.warn(`smegglect: the agent bridge at ${known.url} did not admit this dev server; restart it`)
    }
    return { link: { url: known.url, token: known.token }, close: async () => {} }
  }
  try {
    // Loaded here, so a dev server without the bridge never loads the broker.
    const { startBroker } = await import('./server')
    const broker = await startBroker({
      root,
      origins,
      log: (line) => {
        if (line.startsWith('error')) log.warn(`smegglect bridge: ${line}`)
      },
    })
    log.info(`smegglect: agent bridge on ${broker.url}`)
    return { link: { url: broker.url, token: broker.token }, close: () => broker.close() }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log.warn(`smegglect: the agent bridge did not start: ${reason}`)
    return null
  }
}
