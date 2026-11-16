// src/vite/index.ts
// Vite plugin: injects Smegglect into the dev server, or into a build only when `debug` is set at build time.

import { join } from 'node:path'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { BRIDGE_FILE, readBridgeFile } from '../bridge/bridge-file'
import { bridgeRootFor } from '../bridge/bridge-root'
import { devBridge, loopbackOrigins, type DevBridge } from '../bridge/dev-bridge'
import { ID_BODY, isId } from '../core/limits'
import { git } from './git'

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
  /**
   * Where the bridge, the MCP server and source paths meet, relative to the Vite root or absolute.
   * Default: the nearest folder upward whose `.mcp.json` has the smegglect server (`init` writes it),
   * else the Vite root.
   */
  bridgeRoot?: string
}

/** The dev server's loopback origins, for each local address it listens at. */
function originsOf(server: ViteDevServer): string[] {
  const out = new Set<string>()
  for (const local of server.resolvedUrls?.local ?? []) {
    const url = new URL(local)
    out.add(url.origin)
    for (const origin of loopbackOrigins(Number(url.port), url.protocol)) out.add(origin)
  }
  return [...out]
}

const ID = 'virtual:smegglect-client'
const RESOLVED = `\0${ID}`

/** The overlay's entry: mount options, the Vue source, the client module, and the bridge in `vite serve`. */
function clientModule(options: SmegglectPluginOptions, config: ResolvedConfig, bridgeRoot: string): string {
  const provider = options.git === false ? {} : git(config.root)
  // Read when the module loads; only `vite serve` ever embeds the bridge token, never a build.
  const file = options.bridge && config.command === 'serve' ? readBridgeFile(bridgeRoot) : null
  const mountOptions = {
    ...options.mount,
    project: options.project,
    provider: Object.keys(provider).length ? provider : undefined,
    bridge: file ? { url: file.url, token: file.token } : undefined,
  }
  const vue = options.vue !== false
  return [
    `import { mount } from 'smegglect'`,
    vue ? `import { vueSource } from 'smegglect/vue'` : '',
    options.client ? `import client from ${JSON.stringify(options.client)}` : '',
    `const options = ${JSON.stringify(mountOptions)}`,
    // Source files read relative to the bridge root, where the agent works.
    vue ? `options.sources = [vueSource({ root: ${JSON.stringify(bridgeRoot)} })]` : '',
    options.client ? `Object.assign(options, await client())` : '',
    `const instance = mount(options)`,
    // HMR replaces this module; the old overlay goes first, so the new one mounts once.
    `if (import.meta.hot) import.meta.hot.dispose(() => instance.destroy())`,
  ].filter(Boolean).join('\n')
}

/** A bridge started or stopped elsewhere later reaches the page on its next load. */
function reloadOnBridgeFile(server: ViteDevServer, bridgeRoot: string): void {
  const file = join(bridgeRoot, '.smegglect', BRIDGE_FILE)
  server.watcher.add(file)
  const refresh = (changed: string) => {
    if (changed !== file) return
    const module = server.moduleGraph.getModuleById(RESOLVED)
    if (module) server.moduleGraph.invalidateModule(module)
  }
  for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, refresh)
}

/** The bridge once the dev server listens; settles when it is up, reused or given up on. */
function bridgeWithServer(
  server: ViteDevServer,
  bridgeRoot: string,
  started: (bridge: DevBridge | null) => void,
): Promise<void> {
  const logger = server.config.logger
  const log = {
    info: (line: string) => logger.info(`  ${line}`),
    warn: (line: string) => logger.warn(line),
  }
  const http = server.httpServer
  if (!http) {
    logger.warn(
      'smegglect: bridge needs the Vite dev server\'s own HTTP server;'
        + ' in middleware mode run smegglect-bridge serve',
    )
    return Promise.resolve()
  }
  return new Promise((done) => {
    http.once('listening', () => {
      devBridge(bridgeRoot, originsOf(server), log).then(started).finally(done)
    })
  })
}

export default function smegglect(options: SmegglectPluginOptions): Plugin {
  if (!isId(options.project?.id)) throw new Error(`smegglect: project.id must match ${ID_BODY}`)
  let config: ResolvedConfig
  let bridgeRoot = ''
  let bridge: DevBridge | null = null
  let bridgeReady: Promise<void> = Promise.resolve()
  return {
    name: 'smegglect',
    enforce: 'pre',
    apply: (_config, env) => env.command === 'serve' || options.debug === true,
    configResolved(resolved) {
      config = resolved
      bridgeRoot = bridgeRootFor(resolved.root, options.bridgeRoot)
    },
    configureServer(server) {
      if (!options.bridge) return
      bridgeReady = bridgeWithServer(server, bridgeRoot, (started) => {
        bridge = started
      })
      reloadOnBridgeFile(server, bridgeRoot)
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    async closeBundle() {
      const started = bridge
      bridge = null
      await started?.close()
    },
    async load(id) {
      if (id !== RESOLVED) return null
      await bridgeReady
      return clientModule(options, config, bridgeRoot)
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
