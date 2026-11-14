// src/vue/index.ts
// Optional Vue 3 enrichment. It never imports Vue: it reads dev-only instance fields behind feature checks.

import type { SourceRef } from '../core/model'
import { cleanText } from '../core/redact'
import type { ContextProvider, SourceProvider } from '../dom/providers'

/** The subset of a Vue 3 component instance this provider reads. Version-sensitive by nature. */
interface Instance {
  type?: { __file?: unknown, __name?: unknown, name?: unknown }
  parent?: Instance | null
}

const LIBRARY = /(^|\/)node_modules\//

function instanceOf(el: Element): Instance | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const inst = (cur as unknown as { __vueParentComponent?: Instance }).__vueParentComponent
    if (inst && typeof inst === 'object') return inst
  }
  return null
}

function nameOf(inst: Instance): string | undefined {
  const t = inst.type
  if (!t) return undefined
  const n = typeof t.__name === 'string' ? t.__name : typeof t.name === 'string' ? t.name : undefined
  if (n) return cleanText(n, 64)
  const file = typeof t.__file === 'string' ? t.__file : ''
  return file.match(/([^/\\]+)\.vue$/)?.[1]
}

export interface VueSourceOptions {
  /** Absolute project root; files under it are reported relative to it. The Vite plugin passes it. */
  root?: string
}

/** Project-relative path, or undefined when the file is outside the project or a library. */
export function relativeFile(file: string, root: string | undefined): string | undefined {
  const norm = file.replace(/\\/g, '/')
  if (LIBRARY.test(norm)) return undefined
  if (root) {
    const r = root.replace(/\\/g, '/').replace(/\/?$/, '/')
    if (norm.startsWith(r)) return norm.slice(r.length)
    return undefined
  }
  // Without a root only an already relative path is safe to report.
  return norm.startsWith('/') || /^[A-Za-z]:\//.test(norm) ? undefined : norm
}

/**
 * Owning user component of an element: the nearest instance whose file is project source.
 * Library components (Vuetify, node_modules) are listed as owners but never as the edit location.
 */
export function vueSource(options: VueSourceOptions = {}): SourceProvider {
  return {
    name: 'vue',
    source(el): SourceRef | null {
      const start = instanceOf(el)
      if (!start) return null
      const owners: string[] = []
      let user: { name: string, file: string } | null = null
      for (let inst: Instance | null | undefined = start, depth = 0; inst && depth < 32; inst = inst.parent, depth++) {
        const name = nameOf(inst)
        if (!name) continue
        const raw = typeof inst.type?.__file === 'string' ? inst.type.__file : undefined
        const file = raw ? relativeFile(raw, options.root) : undefined
        // Project SFCs carry a dev-time __file; library components either live in node_modules or have none.
        const kind = file ? '' : raw && LIBRARY.test(raw.replace(/\\/g, '/')) ? ' (library)' : raw ? '' : ' (external)'
        if (owners.length < 6) owners.push(`${name}${kind}`)
        if (!user && file) user = { name, file }
      }
      // Without a project file there is no honest edit location; the caller falls back to visual-only.
      if (!user) return null
      return {
        quality: 'component',
        provenance: 'vue-instance',
        component: user.name,
        file: user.file,
        owners,
      }
    },
  }
}

interface RouteLike {
  currentRoute: { value: { name?: unknown, path: string } }
}

/** Route name and path (never the query or hash) from a Vue Router instance. */
export function routeContext(router: RouteLike): ContextProvider {
  return {
    name: 'route',
    fields: ['name', 'path'],
    read: () => ({ name: String(router.currentRoute.value.name ?? ''), path: router.currentRoute.value.path }),
  }
}

/** Route name for capture conditions, so hash and history routes are distinguishable. */
export function routeScreen(router: RouteLike): () => string | undefined {
  return () => {
    const r = router.currentRoute.value
    return typeof r.name === 'string' && r.name ? r.name : r.path
  }
}
