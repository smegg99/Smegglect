#!/usr/bin/env node
// src/bridge/cli.ts
// smegglect-bridge init | serve | wait | mcp. In mcp, diagnostics go to stderr; stdout belongs to the protocol.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { brokerClient, Disconnected } from './client'
import { init, projectId } from './init'
import { startBroker } from './server'

/** Set from package.json at build time. */
declare const __SMEGGLECT_VERSION__: string

const USAGE = `usage:
  smegglect-bridge init [--root <project>]
  smegglect-bridge serve --root <project> --origin <origin> [--origin <origin>...] [--port <n>]
  smegglect-bridge wait [--root <project>]
  smegglect-bridge mcp --root <project>`

const pause = (ms: number) => new Promise(done => setTimeout(done, ms))

/** Blocks until there is open work, then says what and exits; a bridge that is not up yet is waited for. */
async function wait(root: string) {
  const client = brokerClient(root)
  for (;;) {
    try {
      const res = await client.get<{ open?: { batchId: string, state: string }[] }>('/v1/work?wait=25')
      const open = res.status === 200 ? res.body.open ?? [] : []
      if (open.length) {
        const batches = [...new Set(open.map(w => w.batchId))].join(', ')
        const reopened = open.filter(w => w.state === 'reopened').length
        process.stdout.write(`Smegglect: ${open.length} open ${open.length === 1 ? 'issue' : 'issues'} in ${batches}${reopened ? ` (${reopened} reopened)` : ''}. Call the smegglect next_work tool to get them.\n`)
        return
      }
      if (res.status !== 200) await pause(2000)
    }
    catch (e) {
      if (!(e instanceof Disconnected)) throw e
      await pause(2000)
    }
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { values } = parseArgs({
    args: rest,
    options: {
      root: { type: 'string', default: '.' },
      origin: { type: 'string', multiple: true, default: [] },
      port: { type: 'string', default: '0' },
    },
  })
  if (command === 'init') {
    const root = resolve(values.root)
    const done = await init(root, await readFile(new URL('./skills/smegglect/SKILL.md', import.meta.url), 'utf8'))
    const missing = ['@modelcontextprotocol/sdk', 'zod'].filter(dep => !existsSync(join(root, 'node_modules', dep)))
    process.stdout.write([
      `smegglect-bridge init in ${root}`,
      `  .mcp.json: ${done.mcp} (MCP server "smegglect")`,
      `  .claude/skills/smegglect/SKILL.md: ${done.skill}`,
      `  .gitignore: ${done.gitignore} (.smegglect/)`,
      ...(missing.length ? [``, `The MCP server also needs ${missing.join(' and ')} as dev dependencies.`] : []),
      ``,
      `Next:`,
      `  1. Turn the bridge on in vite.config:`,
      `       smegglect({ project: { id: '${await projectId(root)}' }, bridge: true })`,
      `  2. Start the dev server, report issues on the page and send them.`,
      `  3. Run Claude Code in this folder and type /smegglect.`,
      ``,
    ].join('\n'))
    return
  }
  if (command === 'serve') {
    const port = Number(values.port)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be 0-65535')
    for (const o of values.origin) if (!/^[a-z][a-z0-9+.-]*:\/\/[^/\s]+$/.test(o)) throw new Error(`--origin ${o} is not an origin`)
    const broker = await startBroker({ root: values.root, port, origins: values.origin })
    const stop = () => {
      broker.close().finally(() => process.exit(0))
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    return
  }
  if (command === 'wait') return wait(values.root)
  if (command === 'mcp') {
    // Loaded here so `serve` works without the optional MCP SDK and zod installed.
    const { runMcp } = await import('./mcp')
    await runMcp(brokerClient(values.root), __SMEGGLECT_VERSION__)
    return
  }
  process.stderr.write(`${USAGE}\n`)
  process.exit(2)
}

main().catch((e: unknown) => {
  process.stderr.write(`smegglect-bridge: ${(e as Error).message}\n`)
  process.exit(1)
})
