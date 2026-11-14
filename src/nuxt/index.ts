// src/nuxt/index.ts
// Nuxt module: a client-only plugin in `nuxt dev`, or in a build only when `debug` is set at build time.

import { addPluginTemplate, defineNuxtModule } from '@nuxt/kit'
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
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: 'smegglect', configKey: 'smegglect' },
  defaults: { vue: true, git: true, debug: false },
  setup(options, nuxt) {
    if (!nuxt.options.dev && options.debug !== true) return
    const project = options.project ?? { id: 'nuxt' }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(project.id)) throw new Error('smegglect: project.id must match [A-Za-z0-9_-]{1,64}')
    const provider = options.git === false ? {} : git(nuxt.options.rootDir)
    const mountOptions = { ...options.mount, project, ...(Object.keys(provider).length ? { provider } : {}) }
    addPluginTemplate({
      filename: 'smegglect.client.mjs',
      mode: 'client',
      getContents: () => [
        `import { defineNuxtPlugin, useRouter } from '#app'`,
        `import { mount } from 'smegglect'`,
        `import { routeContext, routeScreen, vueSource } from 'smegglect/vue'`,
        `export default defineNuxtPlugin(() => {`,
        `  const router = useRouter()`,
        `  const options = ${JSON.stringify(mountOptions)}`,
        options.vue === false ? '' : `  options.sources = [vueSource({ root: ${JSON.stringify(nuxt.options.rootDir)} })]`,
        `  options.context = [routeContext(router)]`,
        `  options.screen = routeScreen(router)`,
        `  const instance = mount(options)`,
        `  if (import.meta.hot) import.meta.hot.dispose(() => instance.destroy())`,
        `})`,
      ].filter(Boolean).join('\n'),
    })
  },
})
