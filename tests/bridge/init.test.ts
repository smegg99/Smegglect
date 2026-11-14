// tests/bridge/init.test.ts
// `smegglect-bridge init`: wires a project for Claude Code without touching anything it does not own.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { init } from '../../src/bridge/init'

const SKILL = '---\nname: smegglect\n---\n# Smegglect\n'

/** A project with smegglect installed the way a package manager leaves it. */
function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'sg-init-'))
  mkdirSync(join(root, 'node_modules/smegglect/dist'), { recursive: true })
  writeFileSync(join(root, 'node_modules/smegglect/dist/bridge-cli.js'), '')
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  return root
}

const read = (root: string, name: string) => readFileSync(join(root, name), 'utf8')
const SERVER = { type: 'stdio', command: 'node', args: ['node_modules/smegglect/dist/bridge-cli.js', 'mcp', '--root', '.'] }

describe('init', () => {
  it('creates .mcp.json, the skill and the .gitignore entry in a fresh project', async () => {
    const root = project()
    const done = await init(root, SKILL)
    expect(done).toEqual({ mcp: 'created', skill: 'created', gitignore: 'created' })
    expect(JSON.parse(read(root, '.mcp.json'))).toEqual({ mcpServers: { smegglect: SERVER } })
    expect(read(root, '.claude/skills/smegglect/SKILL.md')).toBe(SKILL)
    expect(read(root, '.gitignore')).toBe('.smegglect/\n')
  })

  it('keeps other MCP servers and .gitignore lines, and changes nothing on a second run', async () => {
    const other = { command: 'other-server', args: [] }
    const root = project({ '.mcp.json': JSON.stringify({ mcpServers: { other } }), '.gitignore': 'node_modules/' })
    expect(await init(root, SKILL)).toEqual({ mcp: 'updated', skill: 'created', gitignore: 'updated' })
    expect(JSON.parse(read(root, '.mcp.json')).mcpServers).toEqual({ other, smegglect: SERVER })
    expect(read(root, '.gitignore')).toBe('node_modules/\n.smegglect/\n')
    expect(await init(root, SKILL)).toEqual({ mcp: 'unchanged', skill: 'unchanged', gitignore: 'unchanged' })
  })

  it('counts an existing ignore rule for .smegglect in any usual spelling', async () => {
    for (const rule of ['.smegglect', '/.smegglect/', '.smegglect/']) {
      const root = project({ '.gitignore': `dist\n${rule}\n` })
      expect((await init(root, SKILL)).gitignore).toBe('unchanged')
    }
  })

  it('refuses an unreadable .mcp.json instead of overwriting it', async () => {
    const root = project({ '.mcp.json': '{ not json' })
    await expect(init(root, SKILL)).rejects.toThrow('.mcp.json is not valid JSON')
    expect(read(root, '.mcp.json')).toBe('{ not json')
    expect(existsSync(join(root, '.claude'))).toBe(false)
  })

  it('refuses a project where smegglect is not installed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sg-init-'))
    await expect(init(root, SKILL)).rejects.toThrow('smegglect is not installed')
    expect(existsSync(join(root, '.mcp.json'))).toBe(false)
  })
})

describe('init from the built CLI', () => {
  it('installs the skill shipped in dist and says what to do next', () => {
    const root = project({ 'package.json': JSON.stringify({ name: '@acme/shop.web' }) })
    const out = execFileSync('node', ['dist/bridge-cli.js', 'init', '--root', root], { encoding: 'utf8' })
    expect(read(root, '.claude/skills/smegglect/SKILL.md')).toBe(readFileSync('.claude/skills/smegglect/SKILL.md', 'utf8'))
    expect(out).toContain('.mcp.json: created')
    expect(out).toContain('smegglect({ project: { id: \'acme-shop-web\' }, bridge: true })')
    expect(out).toContain('/smegglect')
  })
})
