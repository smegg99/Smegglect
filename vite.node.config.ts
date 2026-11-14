// vite.node.config.ts
// Node entries: the Vite plugin, the Nuxt module and the bridge. Never part of the browser graph.
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    // `smegglect-bridge init` installs this skill into a project; the package ships it next to the CLI.
    name: 'smegglect-skill',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'skills/smegglect/SKILL.md', source: readFileSync('.claude/skills/smegglect/SKILL.md', 'utf8') })
    },
  }],
  build: {
    ssr: true,
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    rolldownOptions: {
      input: { vite: 'src/vite/index.ts', nuxt: 'src/nuxt/index.ts', bridge: 'src/bridge/index.ts', 'bridge-cli': 'src/bridge/cli.ts' },
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: 'node/[name]-[hash].js' },
      external: [/^node:/, 'vite', '@nuxt/kit', /^@modelcontextprotocol\/sdk/, 'zod', /^smegglect(\/|$)/],
    },
  },
})
