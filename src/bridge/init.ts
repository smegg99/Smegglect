// src/bridge/init.ts
// Wires a project for Claude Code: the MCP server entry, the batch skill and a git ignore rule. Nothing else.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type Change = 'created' | 'updated' | 'unchanged'

export interface InitResult {
  mcp: Change
  skill: Change
  gitignore: Change
}

const CLI = 'node_modules/smegglect/dist/bridge-cli.js'
const SERVER = { type: 'stdio', command: 'node', args: [CLI, 'mcp', '--root', '.'] }
const SKILL_PATH = '.claude/skills/smegglect/SKILL.md'

async function text(file: string): Promise<string | null> {
  return readFile(file, 'utf8').catch(() => null)
}

async function put(file: string, before: string | null, after: string): Promise<Change> {
  if (before === after) return 'unchanged'
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, after)
  return before === null ? 'created' : 'updated'
}

/** Everything is checked before anything is written, so a refusal leaves the project as it was. */
export async function init(root: string, skill: string): Promise<InitResult> {
  await access(join(root, CLI)).catch(() => {
    throw new Error(`smegglect is not installed in ${root}; add it as a dev dependency first`)
  })

  const mcpFile = join(root, '.mcp.json')
  const mcpBefore = await text(mcpFile)
  let config: { mcpServers?: Record<string, unknown> } & Record<string, unknown> = {}
  if (mcpBefore !== null) {
    try {
      config = JSON.parse(mcpBefore) as typeof config
    }
    catch {
      throw new Error('.mcp.json is not valid JSON; fix or remove it and run init again')
    }
  }
  const same = JSON.stringify(config.mcpServers?.smegglect) === JSON.stringify(SERVER)
  const mcpAfter = same ? mcpBefore! : `${JSON.stringify({ ...config, mcpServers: { ...config.mcpServers, smegglect: SERVER } }, null, 2)}\n`

  const ignoreFile = join(root, '.gitignore')
  const ignoreBefore = await text(ignoreFile)
  const ignored = (ignoreBefore ?? '').split(/\r?\n/).some(line => /^\/?\.smegglect\/?$/.test(line.trim()))
  const ignoreAfter = ignored ? ignoreBefore! : `${ignoreBefore ? `${ignoreBefore.replace(/\n?$/, '\n')}` : ''}.smegglect/\n`

  const skillFile = join(root, SKILL_PATH)
  return {
    mcp: await put(mcpFile, mcpBefore, mcpAfter),
    skill: await put(skillFile, await text(skillFile), skill),
    gitignore: await put(ignoreFile, ignoreBefore, ignoreAfter),
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
