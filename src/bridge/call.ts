// src/bridge/call.ts
// One request on its way to a handler, and what the handlers share.

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PresetRegistry } from '../core/presets'
import type { Agents } from './agents'
import type { Checks, Feed } from './feed'
import { HttpError } from './http'
import type { Store } from './store'

/** Pages carry an admitted Origin; local processes, the MCP server among them, carry none. */
export type Caller = 'page' | 'agent' | 'either'

/** What the broker's handlers share. */
export interface BrokerParts {
  store: Store
  feed: Feed
  checks: Checks
  /** For the task sentences in the work list. */
  registry: PresetRegistry
  agents: Agents
  /** Exact browser origins admitted as pages; a second dev server on the root adds its own. */
  origins: Set<string>
}

/** One request on its way to a handler. */
export interface Call {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  /** Path parameters by name, each a valid id. */
  params: Record<string, string>
  origin: string | undefined
  signal: AbortSignal
  parts: BrokerParts
}


export function param(call: Call, name: string): string {
  const value = call.params[name]
  if (value === undefined) throw new HttpError(404, 'not-found')
  return value
}
