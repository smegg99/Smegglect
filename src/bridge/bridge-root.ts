// src/bridge/bridge-root.ts
// The one folder where the broker, the MCP server, `wait` and the page's source paths meet:
// the project folder the agent works in, which `init` wired.

import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

/** Whether `<dir>/.mcp.json` names a smegglect server, the mark `init` leaves. */
function wired(dir: string): boolean {
  let config: unknown
  try {
    config = JSON.parse(readFileSync(resolve(dir, '.mcp.json'), 'utf8'))
  }
  catch {
    // No file, or one that is not JSON: not wired here.
    return false
  }
  if (typeof config !== 'object' || config === null) return false
  const servers = (config as { mcpServers?: unknown }).mcpServers
  return typeof servers === 'object' && servers !== null && 'smegglect' in servers
}

/**
 * The bridge root for a dev server: `configured` when given (relative to the dev root), else the nearest
 * folder from the dev root upward whose `.mcp.json` has the smegglect server, else the dev root itself.
 */
export function bridgeRootFor(devRoot: string, configured?: string): string {
  const start = resolve(devRoot)
  if (configured) return isAbsolute(configured) ? configured : resolve(start, configured)
  for (let dir = start; ; dir = dirname(dir)) {
    if (wired(dir)) return dir
    if (dirname(dir) === dir) return start
  }
}
