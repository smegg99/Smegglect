#!/usr/bin/env node
// src/bridge/cli.ts
// smegglect-bridge init | serve | wait | mcp.
// In mcp, diagnostics go to stderr; stdout belongs to the protocol.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { VERSION } from '../core/version'
import { AGENT_COMMANDS, cliAgent, runAgentCommand } from './agent-commands'
import { brokerClient, Disconnected } from './client'
import { init, projectId, type InitResult } from './init'
import { startBroker } from './server'

const USAGE = `usage:
  smegglect-bridge init [--root <project>]
  smegglect-bridge serve --root <project> --origin <origin> [--origin <origin>...] [--port <n>]
  smegglect-bridge wait [--root <project>]
  smegglect-bridge mcp --root <project>

The agent's operations, printing what the MCP tools return (all take --root):
  smegglect-bridge work [--no-claim]
  smegglect-bridge batches
  smegglect-bridge batch <batch>
  smegglect-bridge evidence <batch> <issue>
  smegglect-bridge check <batch> <issue>
  smegglect-bridge selection
  smegglect-bridge attachment <batch> <attachment>   (prints the approved image's path)
  smegglect-bridge report <batch> <issue> --state <state>
      [--summary <text>] [--file <path>...] [--check <command>=<outcome>...] [--result-id <id>]`

const pause = (ms: number) => new Promise(done => setTimeout(done, ms))

type Listened = { open?: { batch_id: string }[], error?: string } | null

/** Blocks until there is open work, then says what; waits for a bridge not up yet, and ends at a refusal. */
async function wait(root: string) {
  const client = brokerClient(root, cliAgent())
  for (;;) {
    try {
      // Listening only: it takes nothing, so the session it wakes gets the issues with next_work.
      const res = await client.get<Listened>('/v1/work?wait=25&listen=1')
      // Exits with the reason, so the session it wakes sees why instead of a wait that never ends.
      const reason = res.body?.error ?? ''
      if (res.status !== 200) throw new Error(`the bridge answered ${res.status} ${reason}`.trim())
      const open = res.body?.open ?? []
      if (open.length) {
        process.stdout.write(waitMessage(open))
        return
      }
    }
    catch (error) {
      if (!(error instanceof Disconnected)) throw error
      await pause(2000)
    }
  }
}

function waitMessage(open: { batch_id: string }[]): string {
  const batches = [...new Set(open.map(item => item.batch_id))].join(', ')
  const issues = open.length === 1 ? 'issue' : 'issues'
  return `Smegglect: ${open.length} open ${issues} in ${batches}.`
    + ` Call the smegglect next_work tool to get them.\n`
}

/** What `init` did, and what to do next in this project's layout. */
async function initReport(root: string, done: InitResult): Promise<string> {
  const atRoot = done.cli.startsWith('node_modules/')
  const where = atRoot ? '' : ` in ${done.cli.split('/')[0]}/`
  const missing = done.missing.length
    ? ['', `The MCP server also needs ${done.missing.join(' and ')} as dev dependencies${where}.`]
    : []
  const devServer = [
    `  1. Turn the bridge on in vite.config:`,
    `       smegglect({ project: { id: '${await projectId(root)}' }, bridge: true })`,
    `  2. Start the dev server, report issues on the page and send them.`,
  ]
  const desktop = [
    `  1. Run the bridge from this folder while the app runs, and give the overlay a bridge that reaches it`,
    `     (README, "Desktop apps"):`,
    `       node ${done.cli} serve --root . --origin <the app's origin>`,
    `  2. Report issues in the app and send them.`,
  ]
  return [
    `smegglect-bridge init in ${root}`,
    `  .mcp.json: ${done.mcp} (MCP server "smegglect")`,
    `  .claude/skills/smegglect/SKILL.md: ${done.skill}`,
    `  .gitignore: ${done.gitignore} (.smegglect/)`,
    ...missing,
    ``,
    `Next:`,
    ...(atRoot ? devServer : desktop),
    `  3. Run Claude Code in this folder and type /smegglect.`,
    `     A session that was already running must be restarted to load the smegglect tools;`,
    `     Until then, \`node ${done.cli} help\` lists commands that do the same from a shell.`,
    ``,
    `Bridge root: ${root}`,
    `  The dev server's bridge, the MCP server and \`wait\` meet in its .smegglect/ folder.`,
    `  Once the app runs, \`node ${done.cli} work\` here proves the link.`,
    ``,
  ].join('\n')
}

interface Values {
  root: string
  origin: string[]
  port: string
}

async function runInit(values: Values) {
  const root = resolve(values.root)
  const skill = await readFile(new URL('./skills/smegglect/SKILL.md', import.meta.url), 'utf8')
  process.stdout.write(await initReport(root, await init(root, skill)))
}

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/\s]+$/

async function runServe(values: Values) {
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be 0-65535')
  const bad = values.origin.find(origin => !ORIGIN.test(origin))
  if (bad !== undefined) throw new Error(`--origin ${bad} is not an origin`)
  const broker = await startBroker({ root: values.root, port, origins: values.origin })
  const stop = () => {
    broker.close().finally(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

async function runMcpServer(values: Values) {
  // Loaded here so `serve` works without the optional MCP SDK and zod installed.
  const { runMcp } = await import('./mcp')
  await runMcp(values.root, VERSION)
}

const COMMANDS: Record<string, (values: Values) => Promise<void>> = {
  init: runInit,
  serve: runServe,
  wait: values => wait(values.root),
  mcp: runMcpServer,
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'help' || command === '--help') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      'root': { type: 'string', default: '.' },
      'origin': { type: 'string', multiple: true, default: [] },
      'port': { type: 'string', default: '0' },
      'state': { type: 'string' },
      'summary': { type: 'string' },
      'file': { type: 'string', multiple: true, default: [] },
      'check': { type: 'string', multiple: true, default: [] },
      'result-id': { type: 'string' },
      'no-claim': { type: 'boolean' },
    },
  })
  const agentCommand = command === undefined ? undefined : AGENT_COMMANDS[command]
  if (agentCommand) {
    const input = { ...values, resultId: values['result-id'], noClaim: values['no-claim'], positionals }
    process.exitCode = await runAgentCommand(agentCommand, input)
    return
  }
  const run = command === undefined ? undefined : COMMANDS[command]
  if (!run) {
    process.stderr.write(`${USAGE}\n`)
    process.exit(2)
  }
  await run(values)
}

main().catch((error: unknown) => {
  process.stderr.write(`smegglect-bridge: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
