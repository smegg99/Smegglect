// src/bridge/agent-commands.ts
// The agent's operations as shell commands, printing what the MCP tools return:
// for a session that has the skill but not the tools, or an agent without MCP.

import { createRegistry } from '../core/presets'
import { brokerClient, type AgentIdentity, type BrokerClient } from './client'
import * as operations from './operations'

/** What the command line gave a command, beyond its name. */
export interface CommandInput {
  root: string
  /** The words after the command: a batch id, then an issue id. */
  positionals: string[]
  state?: string
  summary?: string
  file: string[]
  check: string[]
  resultId?: string
  /** `work --no-claim`: look without taking the issues. */
  noClaim?: boolean
}

interface AgentCommand {
  /** Names of the positional arguments, for the usage line. */
  args: string[]
  run: (client: BrokerClient, input: CommandInput) => Promise<operations.Outcome>
}

const word = (input: CommandInput, index: number) => input.positionals[index] ?? ''

/** A shell agent's commands share one name, `SMEGGLECT_AGENT` when set, so its issues stay its own. */
export function cliAgent(): AgentIdentity {
  const named = process.env.SMEGGLECT_AGENT
  // Claude Code marks the commands it runs with CLAUDECODE, so the page can say Claude is the one listening.
  const client = process.env.CLAUDECODE ? 'claude-code' : 'smegglect-bridge'
  return { id: named && /^[\w-]{1,64}$/.test(named) ? named : 'cli', client }
}

/** `<command>=<outcome>`, split at the last `=`, since a command may hold one. */
function parseCheck(text: string): { command: string, outcome: string } {
  const at = text.lastIndexOf('=')
  if (at < 0) return { command: text, outcome: '' }
  return { command: text.slice(0, at), outcome: text.slice(at + 1) }
}

function report(client: BrokerClient, input: CommandInput) {
  return operations.reportResult(client, {
    batchId: word(input, 0),
    issueId: word(input, 1),
    state: input.state ?? '',
    summary: input.summary ?? '',
    files: input.file.length ? input.file : undefined,
    checks: input.check.length ? input.check.map(parseCheck) : undefined,
    resultId: input.resultId,
  })
}

export const AGENT_COMMANDS: Record<string, AgentCommand> = {
  batches: { args: [], run: client => operations.listBatches(client) },
  work: { args: [], run: (client, input) => operations.nextWork(client, !input.noClaim) },
  batch: {
    args: ['batch'],
    run: (client, input) => operations.getBatch(client, createRegistry(), word(input, 0)),
  },
  evidence: {
    args: ['batch', 'issue'],
    run: (client, input) => operations.issueEvidence(client, word(input, 0), word(input, 1)),
  },
  check: {
    args: ['batch', 'issue'],
    run: (client, input) => operations.checkIssue(client, word(input, 0), word(input, 1)),
  },
  selection: { args: [], run: client => operations.selection(client) },
  attachment: {
    args: ['batch', 'attachment'],
    run: (client, input) => operations.imagePath(client, input.root, word(input, 0), word(input, 1)),
  },
  report: { args: ['batch', 'issue'], run: report },
}

/** Prints the answer and says how it went: 0 when it was had, 1 when refused (the reason on stderr). */
export async function runAgentCommand(command: AgentCommand, input: CommandInput): Promise<number> {
  if (input.positionals.length < command.args.length) {
    process.stderr.write(`smegglect-bridge: expected ${command.args.map(name => `<${name}>`).join(' ')}\n`)
    return 2
  }
  const client = brokerClient(input.root, cliAgent())
  const outcome = await command.run(client, input)
  const stream = outcome.ok ? process.stdout : process.stderr
  stream.write(`${operations.render(outcome)}\n`)
  // On stderr, so stdout stays the answer a script parses.
  const warning = await operations.versionWarning(client)
  if (warning) process.stderr.write(`${warning}\n`)
  return outcome.ok ? 0 : 1
}
