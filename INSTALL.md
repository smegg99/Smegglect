# Adding Smegglect to an app

These steps are written for a coding agent (Claude Code or another) asked to add Smegglect to the app in the
current project. A person can follow them too.

Smegglect is a development-only overlay: the person points at problems in the running app, and the issues
go to Claude Code through a local bridge. It is never part of a production build.

## 1. Find the stack

Look at the project's files and pick one path:

- `nuxt.config.ts` or `nuxt.config.js`: the **Nuxt** module.
- Any other `vite.config.*`: the **Vite** plugin. It adds the overlay to any page the dev server serves;
  component names and files come from Vue apps (tested with Vue 3 and plain pages).
- A Wails v3 app (`go.mod` requires `github.com/wailsapp/wails/v3`): follow the Wails section of
  [GUIDE.md](GUIDE.md). It needs Go changes; show the person the plan before making them.
- Anything else: `mount()` behind a build-time development flag (step 3).

In a monorepo, configure the package that serves the interface, and run step 4 in the folder where the person
runs Claude Code (usually the repository root).

## 2. Install

Use the package manager the lockfile names:

| Lockfile | Command |
|---|---|
| `bun.lock` or `bun.lockb` | `bun add -d smegglect @modelcontextprotocol/sdk zod` |
| `pnpm-lock.yaml` | `pnpm add -D smegglect @modelcontextprotocol/sdk zod` |
| `yarn.lock` | `yarn add -D smegglect @modelcontextprotocol/sdk zod` |
| `package-lock.json`, or none | `npm install -D smegglect @modelcontextprotocol/sdk zod` |

`@modelcontextprotocol/sdk` and `zod` are only for the Claude Code bridge; leave them out if the person does
not use Claude Code. Smegglect needs Node.js 20 or newer, and Vite 6 or newer for the plugin.

## 3. Configure

Use the `name` from `package.json` as the project id, reduced to letters, digits, `-` and `_` (at most 64;
`mount()` refuses anything else).

Vite, in `vite.config.*`, after the framework plugin:

```ts
import smegglect from 'smegglect/vite'

export default defineConfig({
  plugins: [
    // ...the existing plugins
    smegglect({ project: { id: 'my-app' }, bridge: true }),
  ],
})
```

Nuxt, in `nuxt.config.*`:

```ts
export default defineNuxtConfig({
  modules: ['smegglect/nuxt'],
  smegglect: { project: { id: 'my-app' }, bridge: true },
})
```

Both are active on the dev server only. Leave out `bridge: true` when the person does not use Claude Code.

Any other setup, in the app's entry module:

```ts
if (import.meta.env.DEV) {
  const { mount } = await import('smegglect')
  mount({ project: { id: 'my-app' } })
}
```

Use the bundler's own build-time development flag. A runtime check alone (a URL parameter, `localStorage`)
would still ship the overlay in the production bundle.

## 4. Connect Claude Code

In the folder where the person runs Claude Code:

```sh
npx smegglect-bridge init
```

It adds the `smegglect` server to `.mcp.json` (other servers stay), installs the `/smegglect` skill to
`.claude/skills/smegglect/`, and adds `.smegglect/` to `.gitignore`. A Claude Code session that was already
running must be restarted to load the new tools.

## 5. Check

Start the dev server. With `bridge: true` it prints `smegglect: agent bridge on http://127.0.0.1:...`. Ask the
person to open the app: a paw sits at the bottom edge of the page. With the app open, `npx smegglect-bridge
work` in the folder from step 4 prints the open work as JSON, which proves the link.

## 6. Tell the person how to use it

1. Click the paw at the bottom of the app.
2. **Pick** and click an element, or **Region** and drag around several.
3. Choose what is wrong from the list, add a note, and press **Add issue**.
4. Open **Issues**, press **Send to Claude**, then type `/smegglect` in Claude Code.

Change nothing else: no app code beyond the configuration above, and never commit `.smegglect/`.
