// src/vite/index.ts
// Vite plugin: injects Smegglect into the dev server, or into a build only when `debug` is set at build time.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import type { Broker } from '../bridge/server'
import { git } from './git'

function bridgeInfo(root: string): { url: string, token: string } | null {
  try {
    const raw = JSON.parse(readFileSync(join(root, '.smegglect', 'bridge.json'), 'utf8')) as { url?: unknown, token?: unknown }
    return typeof raw.url === 'string' && typeof raw.token === 'string' ? { url: raw.url, token: raw.token } : null
  }
  catch {
    return null
  }
}

export interface SmegglectPluginOptions {
  project: { id: string, name?: string }
  /** Include the runtime in `vite build`. Decided when building; the built page cannot switch it on. */
  debug?: boolean
  /** Owning Vue component for selected elements (dev builds of Vue only). Default true. */
  vue?: boolean
  /** Record git branch and commit as provider evidence. Default true. */
  git?: boolean
  /** Extra mount options, JSON-serialisable. */
  mount?: Record<string, unknown>
  /**
   * Module (from the project root) whose default export returns more mount options, functions allowed,
   * e.g. a native save. It is imported only where Smegglect is included, so release builds never see it.
   */
  client?: string
  /**
   * Dev server only: start the agent bridge with the dev server, admitting the dev server's own origins.
   * A bridge already running for this project root is used instead.
   */
  bridge?: boolean
}

/** Whether the broker named in bridge.json is up and holds that token. */
async function answers(info: { url: string, token: string }): Promise<boolean> {
  try {
    const res = await fetch(`${info.url}/v1/health`, { headers: { authorization: `Bearer ${info.token}` }, signal: AbortSignal.timeout(1000) })
    return res.ok
  }
  catch {
    return false
  }
}

/** The dev server's loopback origins; localhost and 127.0.0.1 are the same server. */
function originsOf(server: ViteDevServer): string[] {
  const out = new Set<string>()
  for (const local of server.resolvedUrls?.local ?? []) {
    const u = new URL(local)
    out.add(u.origin)
    for (const host of ['localhost', '127.0.0.1']) out.add(`${u.protocol}//${host}:${u.port}`)
  }
  return [...out]
}

const ID = 'virtual:smegglect-client'
const RESOLVED = `\0${ID}`

export default function smegglect(options: SmegglectPluginOptions): Plugin {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.project?.id ?? '')) throw new Error('smegglect: project.id must match [A-Za-z0-9_-]{1,64}')
  let config: ResolvedConfig
  let broker: Broker | null = null
  // Settles once the dev server listens and the bridge is up, used or given up on.
  let bridgeReady: Promise<void> = Promise.resolve()
  return {
    name: 'smegglect',
    enforce: 'pre',
    apply: (_cfg, env) => env.command === 'serve' || options.debug === true,
    configResolved(resolved) {
      config = resolved
    },
    configureServer(server) {
      if (!options.bridge) return
      const root = server.config.root
      const logger = server.config.logger
      const start = async () => {
        const known = bridgeInfo(root)
        if (known && await answers(known)) {
          logger.info(`  smegglect: using the agent bridge at ${known.url}`)
          return
        }
        try {
          const { startBroker } = await import('../bridge/server')
          broker = await startBroker({ root, origins: originsOf(server), log: (line) => {
            if (line.startsWith('error')) logger.warn(`smegglect bridge: ${line}`)
          } })
          logger.info(`  smegglect: agent bridge on ${broker.url}`)
        }
        catch (e) {
          logger.warn(`smegglect: the agent bridge did not start: ${(e as Error).message}`)
        }
      }
      const http = server.httpServer
      if (http) bridgeReady = new Promise(done => http.once('listening', () => void start().finally(done)))
      else logger.warn('smegglect: bridge needs the Vite dev server\'s own HTTP server; in middleware mode run smegglect-bridge serve')
      // A bridge started or stopped elsewhere later reaches the page on its next load.
      const file = join(root, '.smegglect', 'bridge.json')
      server.watcher.add(file)
      const refresh = (changed: string) => {
        if (changed !== file) return
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
      }
      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, refresh)
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    async closeBundle() {
      const b = broker
      broker = null
      await b?.close()
    },
    async load(id) {
      if (id !== RESOLVED) return null
      await bridgeReady
      const provider = options.git === false ? {} : git(config.root)
      const mountOptions = { ...options.mount, project: options.project, ...(Object.keys(provider).length ? { provider } : {}) }
      const vue = options.vue !== false
      // Read when the module loads; only `vite serve` ever embeds the bridge token, never a build.
      const bridge = options.bridge && config.command === 'serve' ? bridgeInfo(config.root) : null
      if (bridge) Object.assign(mountOptions, { bridge })
      return [
        `import { mount } from 'smegglect'`,
        vue ? `import { vueSource } from 'smegglect/vue'` : '',
        options.client ? `import client from ${JSON.stringify(options.client)}` : '',
        `const options = ${JSON.stringify(mountOptions)}`,
        vue ? `options.sources = [vueSource({ root: ${JSON.stringify(config.root)} })]` : '',
        options.client ? `Object.assign(options, await client())` : '',
        `const instance = mount(options)`,
        // HMR replaces this module; the old overlay goes first, so the new one mounts once.
        `if (import.meta.hot) import.meta.hot.dispose(() => instance.destroy())`,
      ].filter(Boolean).join('\n')
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        // Inline module: Vite resolves the import in both the dev server and a debug build.
        return [{ tag: 'script', attrs: { type: 'module' }, children: `import '${ID}'`, injectTo: 'body' }]
      },
    },
  }
}
