// src/bridge/init.ts
// Wires a project for Claude Code: the MCP server entry, the batch skill and a git ignore rule. Nothing else.

import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type Change = 'created' | 'updated' | 'unchanged'

export interface InitResult {
  mcp: Change
  skill: Change
  gitignore: Change
  /** The bridge CLI, relative to the project; in a subfolder when the app's packages live there. */
  cli: string
  /** Optional packages the MCP server needs that the installed CLI cannot reach. */
  missing: string[]
}

const CLI = 'node_modules/smegglect/dist/bridge-cli.js'
const MCP_DEPS = ['@modelcontextprotocol/sdk', 'zod']
const SKILL_PATH = '.claude/skills/smegglect/SKILL.md'

/**
 * The installed CLI: in the project itself, or in the one subfolder that holds the app's packages
 * (a desktop app's frontend/).
 */
async function findCli(root: string): Promise<string> {
  if (existsSync(join(root, CLI))) return CLI
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const found = entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .filter(entry => existsSync(join(root, entry.name, CLI)))
    .map(entry => `${entry.name}/${CLI}`)
  if (found.length > 1) {
    const folders = found.map(path => path.split('/')[0]).join(', ')
    throw new Error(
      `smegglect is installed in several folders (${folders}); run init with --root set to one of them`,
    )
  }
  const [only] = found
  if (!only) throw new Error(`smegglect is not installed in ${root}; add it as a dev dependency first`)
  return only
}

/** A package is reachable the way Node finds it from the CLI's real location, a linked install included. */
function reachable(cli: string, name: string): boolean {
  for (let dir = dirname(realpathSync(cli)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', name))) return true
    if (dirname(dir) === dir) return false
  }
}

async function text(file: string): Promise<string | null> {
  return readFile(file, 'utf8').catch(() => null)
}

async function put(file: string, before: string | null, after: string): Promise<Change> {
  if (before === after) return 'unchanged'
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, after)
  return before === null ? 'created' : 'updated'
}

type McpConfig = { mcpServers?: Record<string, unknown> } & Record<string, unknown>

/** `.mcp.json` with the smegglect server added, or as it was when it already has this one. */
function withServer(before: string | null, server: Record<string, unknown>): string {
  let config: McpConfig = {}
  if (before !== null) {
    try {
      config = JSON.parse(before) as McpConfig
    }
    catch {
      throw new Error('.mcp.json is not valid JSON; fix or remove it and run init again')
    }
  }
  const same = JSON.stringify(config.mcpServers?.smegglect) === JSON.stringify(server)
  if (before !== null && same) return before
  const mcpServers = { ...config.mcpServers, smegglect: server }
  return `${JSON.stringify({ ...config, mcpServers }, null, 2)}\n`
}

/** `.gitignore` with `.smegglect/` added, or as it was when any usual spelling of it is there. */
function withIgnore(before: string | null): string {
  const lines = (before ?? '').split(/\r?\n/)
  if (before !== null && lines.some(line => /^\/?\.smegglect\/?$/.test(line.trim()))) return before
  const kept = before ? before.replace(/\n?$/, '\n') : ''
  return `${kept}.smegglect/\n`
}

/** Everything is checked before anything is written, so a refusal leaves the project as it was. */
export async function init(root: string, skill: string): Promise<InitResult> {
  const cli = await findCli(root)
  const server = { type: 'stdio', command: 'node', args: [cli, 'mcp', '--root', '.'] }
  const mcpFile = join(root, '.mcp.json')
  const mcpBefore = await text(mcpFile)
  const mcpAfter = withServer(mcpBefore, server)
  const ignoreFile = join(root, '.gitignore')
  const ignoreBefore = await text(ignoreFile)
  const ignoreAfter = withIgnore(ignoreBefore)
  const skillFile = join(root, SKILL_PATH)
  return {
    mcp: await put(mcpFile, mcpBefore, mcpAfter),
    // The skill's commands name the CLI where this project has it.
    skill: await put(skillFile, await text(skillFile), skill.replaceAll(CLI, cli)),
    gitignore: await put(ignoreFile, ignoreBefore, ignoreAfter),
    cli,
    missing: MCP_DEPS.filter(dependency => !reachable(join(root, cli), dependency)),
  }
}

/** A project id from package.json's name, in the characters the plugin accepts. */
export async function projectId(root: string): Promise<string> {
  const name = await readFile(join(root, 'package.json'), 'utf8')
    .then(raw => String((JSON.parse(raw) as { name?: unknown }).name ?? ''))
    .catch(() => '')
  const id = name.replace(/^@/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return id || 'my-app'
}
