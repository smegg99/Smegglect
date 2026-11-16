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

function isInstance(value: unknown): value is Instance {
  return !!value && typeof value === 'object'
}

function instanceOf(element: Element): Instance | null {
  for (let cur: Element | null = element; cur; cur = cur.parentElement) {
    const inst = '__vueParentComponent' in cur ? cur.__vueParentComponent : undefined
    if (isInstance(inst)) return inst
  }
  return null
}

/** The name a component declares: the compiler's `__name`, else its own `name`. */
function declaredName(type: NonNullable<Instance['type']>): string | undefined {
  if (typeof type.__name === 'string') return type.__name
  if (typeof type.name === 'string') return type.name
  return undefined
}

function nameOf(inst: Instance): string | undefined {
  const type = inst.type
  if (!type) return undefined
  const name = declaredName(type)
  if (name) return cleanText(name, 64)
  const file = typeof type.__file === 'string' ? type.__file : ''
  return file.match(/([^/\\]+)\.vue$/)?.[1]
}

/** How a component without a project file is listed among the owners. */
function ownerSuffix(raw: string | undefined): string {
  if (raw && LIBRARY.test(raw.replace(/\\/g, '/'))) return ' (library)'
  return raw ? '' : ' (external)'
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
    const prefix = root.replace(/\\/g, '/').replace(/\/?$/, '/')
    if (norm.startsWith(prefix)) return norm.slice(prefix.length)
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
    source(element): SourceRef | null {
      const start = instanceOf(element)
      if (!start) return null
      const owners: string[] = []
      let user: { name: string, file: string } | null = null
      for (
        let inst: Instance | null | undefined = start, depth = 0;
        inst && depth < 32;
        inst = inst.parent, depth++
      ) {
        const name = nameOf(inst)
        if (!name) continue
        const raw = typeof inst.type?.__file === 'string' ? inst.type.__file : undefined
        const file = raw ? relativeFile(raw, options.root) : undefined
        // Project SFCs carry a dev-time __file; library components either live in node_modules or have none.
        const kind = file ? '' : ownerSuffix(raw)
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
    read: () => ({
      name: String(router.currentRoute.value.name ?? ''),
      path: router.currentRoute.value.path,
    }),
  }
}

/** Route name for capture conditions, so hash and history routes are distinguishable. */
export function routeScreen(router: RouteLike): () => string | undefined {
  return () => {
    const route = router.currentRoute.value
    return typeof route.name === 'string' && route.name ? route.name : route.path
  }
}
