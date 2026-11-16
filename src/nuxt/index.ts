// src/nuxt/index.ts
// Nuxt module: a client-only plugin in `nuxt dev`, or in a build only when `debug` is set at build time.

import type { Server } from 'node:http'
import { addPluginTemplate, defineNuxtModule, updateTemplates, useLogger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { bridgeRootFor } from '../bridge/bridge-root'
import { devBridge, loopbackOrigins, type BridgeLink, type DevBridge } from '../bridge/dev-bridge'
import { ID_BODY, isId } from '../core/limits'
import { git } from '../vite/git'

export interface ModuleOptions {
  project?: { id: string, name?: string }
  /** Include the runtime in `nuxt build` / `nuxt generate`. */
  debug?: boolean
  /** Owning Vue component for selected elements. Default true. */
  vue?: boolean
  /** Record git branch and commit as provider evidence. Default true. */
  git?: boolean
  /** Extra mount options, JSON-serialisable. */
  mount?: Record<string, unknown>
  /**
   * `nuxt dev` only: start the agent bridge once the dev server listens, admitting the port it really got.
   * A bridge already running for this project is used instead. Builds never carry it.
   */
  bridge?: boolean
  /**
   * Where the bridge, the MCP server and source paths meet, relative to the Nuxt root or absolute.
   * Default: the nearest folder upward whose `.mcp.json` has the smegglect server, else the Nuxt root.
   */
  bridgeRoot?: string
}

const PLUGIN = 'smegglect.client.mjs'

/** The bridge follows the dev server: started when it listens, closed with it. */
function bridgeWithServer(nuxt: Nuxt, bridgeRoot: string): () => BridgeLink | null {
  const logger = useLogger('smegglect')
  let bridge: DevBridge | null = null
  nuxt.hook('listen', async (server: Server) => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    bridge = await devBridge(bridgeRoot, loopbackOrigins(port), logger)
    // The plugin may have been written before the port was known; write it again with the address.
    await updateTemplates({ filter: template => template.filename === PLUGIN })
  })
  nuxt.hook('close', async () => {
    const started = bridge
    bridge = null
    await started?.close()
  })
  return () => bridge?.link ?? null
}

function pluginSource(
  options: ModuleOptions,
  mountOptions: Record<string, unknown>,
  rootDir: string,
): string {
  return [
    `import { defineNuxtPlugin, useRouter } from '#app'`,
    `import { mount } from 'smegglect'`,
    `import { routeContext, routeScreen, vueSource } from 'smegglect/vue'`,
    `export default defineNuxtPlugin(() => {`,
    `  const router = useRouter()`,
    `  const options = ${JSON.stringify(mountOptions)}`,
    options.vue === false ? '' : `  options.sources = [vueSource({ root: ${JSON.stringify(rootDir)} })]`,
    `  options.context = [routeContext(router)]`,
    `  options.screen = routeScreen(router)`,
    `  const instance = mount(options)`,
    `  if (import.meta.hot) import.meta.hot.dispose(() => instance.destroy())`,
    `})`,
  ].filter(Boolean).join('\n')
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: 'smegglect', configKey: 'smegglect' },
  defaults: { vue: true, git: true, debug: false },
  setup(options, nuxt) {
    if (!nuxt.options.dev && options.debug !== true) return
    const project = options.project ?? { id: 'nuxt' }
    if (!isId(project.id)) throw new Error(`smegglect: project.id must match ${ID_BODY}`)
    const provider = options.git === false ? {} : git(nuxt.options.rootDir)
    const hasProvider = Object.keys(provider).length > 0
    // Source files read relative to the bridge root, where the agent works.
    const bridgeRoot = bridgeRootFor(nuxt.options.rootDir, options.bridgeRoot)
    const linkOf = options.bridge && nuxt.options.dev ? bridgeWithServer(nuxt, bridgeRoot) : () => null
    addPluginTemplate({
      filename: PLUGIN,
      mode: 'client',
      // Run again once the dev server listens, so the bridge's address and token are in it.
      getContents: () => {
        const mountOptions = { ...options.mount, project, provider: hasProvider ? provider : undefined }
        const bridge = linkOf() ?? undefined
        return pluginSource(options, { ...mountOptions, bridge }, bridgeRoot)
      },
    })
  },
})
