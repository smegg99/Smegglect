// tests/unit/boundary.test.ts
// C01/C02: entries import without side effects; core and dom never reach Vue, Node or adapters.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|vue)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

function imports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(m => (m[1] ?? m[2]) as string)
}

describe('dependency boundaries', () => {
  it('core imports only core', () => {
    for (const file of sources(join(root, 'src/core'))) {
      for (const spec of imports(file)) expect(spec, `${file} -> ${spec}`).toMatch(/^\.\//)
    }
  })

  /** Top-level source area a relative import lands in, e.g. `dom` for src/dom/x.ts. */
  const area = (file: string, spec: string) => relative(join(root, 'src'), resolve(dirname(file), spec)).split('/')[0]

  it('dom imports only core and dom', () => {
    for (const file of sources(join(root, 'src/dom'))) {
      for (const spec of imports(file)) {
        expect(spec, `${file} -> ${spec}`).toMatch(/^\.\.?\//)
        expect(['core', 'dom'], `${file} -> ${spec}`).toContain(area(file, spec))
      }
    }
  })

  it('browser code never reaches the Node bridge, Vite plugin or Nuxt module', () => {
    for (const dir of ['src/core', 'src/dom', 'src/overlay', 'src/vue', 'src/wails']) {
      for (const file of sources(join(root, dir))) {
        for (const spec of imports(file).filter(s => s.startsWith('.'))) {
          expect(['bridge', 'vite', 'nuxt'], `${file} -> ${spec}`).not.toContain(area(file, spec))
        }
      }
    }
  })

  it('no browser entry reaches node builtins, nuxt, wails or mcp', () => {
    for (const dir of ['src/core', 'src/dom', 'src/overlay', 'src/vue', 'src/wails']) {
      for (const file of sources(join(root, dir))) {
        for (const spec of imports(file)) expect(spec, `${file} -> ${spec}`).not.toMatch(/^(node:|nuxt|@nuxt|@wailsio|@modelcontextprotocol|fs$|path$)/)
      }
    }
  })

  it('importing core in Node has no side effects and needs no DOM', async () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
    const core = await import('../../src/core/index')
    expect(core.BATCH_SCHEMA).toBe('smegglect.batch')
    expect(typeof core.createRegistry).toBe('function')
  })

  it('importing the dom engine in Node does not touch window or document', async () => {
    const dom = await import('../../src/dom/index')
    expect(typeof dom.createEngine).toBe('function')
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined')
  })
})
