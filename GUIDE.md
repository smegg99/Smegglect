# Smegglect guide

The full reference. The [README](README.md) has the short version; [INSTALL.md](INSTALL.md) is the setup
written for a coding agent.

## What It Does

`mount()` adds one `<smegglect-root>` element with an open shadow root to the page and
nothing else: no global styles, fonts or attributes on your elements, and no network
requests unless you turn the agent bridge on. The overlay is a cat's paw on an edge of the
page. It unfolds a toolbar (Pick, Region, Measure, Undo, Redo, Show, Issues, Settings,
More) and, out of that toolbar, a drawer as wide as it with the tabs Element, Issues,
History and Settings. Drag the paw to another edge and the toolbar and the drawer go with
it; fold the paw and the drawer slides back in, and out again at the same tab when you
unfold it.

While picking, the next click selects an element instead of activating it; your page gets
every other event. With Measure on, the overlay shows sizes, paddings, margins and the
distance to the selection, and a click picks a margin, a padding or the gap between two
elements. Each issue stays on the page as a numbered plate above its target until you send
it.

With the agent bridge, Send to Claude hands the issues to a local broker. Claude Code
reads them through the bridge's MCP server or its `smegglect-bridge` commands, fixes them,
checks each one on the open page and reports back, and the Issues tab shows where each
report stands. Without the bridge, Copy prompt or the downloaded `task.md` is the hand-off.

Smegglect ships in no production build. The Vite plugin and the Nuxt module include it on
the dev server only, or in a build when you set `debug` at build time; nothing in a built
page can switch it on.

### Workflow

1. Press Pick (Alt+Shift+P) and click an element, or Region (Alt+Shift+R) and drag.
   Shift-, Ctrl- or Cmd-click adds an element to a group. Measure (Alt+Shift+M) lets a
   click pick a margin, a padding or a gap instead; it goes with Pick, never with Region:
   turning one of those two on turns the other off. As in CAD, a region dragged to the
   right lists the elements fully inside it and one dragged to the left the elements it
   touches; Claude gets them with their components and files.
2. The Element tab names the selection and shows its measurements. Under them is the tree
   of issue types: Size and space, Fit, Alignment, Look, Behaviour and access, Differs
   from another and Other, from "text clipped" and "too small to tap" to "should be
   another control", "not from the design system" and "should go". Types that compare two
   elements ask for B, the reference, on the page.
3. Write what is wrong in the note, paste a screenshot with Ctrl+V if it helps, and press
   Add issue (Ctrl+Enter). The same issue twice is refused.
4. The Issues tab lists everything by page. Send to Claude, Copy prompt or Download .zip
   freezes the issues into a report; new ones start the next.
5. The History tab shows what was added, edited, deleted, undone, copied and sent.

Escape steps back one level at a time. Opening an issue never navigates or scrolls your
app; only its Show on page key scrolls to it.

### Support

- [x] Plain HTML page with no framework (the compiled overlay brings its own Vue)
- [x] Vue 3 and Nuxt 4 hosts, with component-level ownership from Vue dev builds
- [x] Chromium 156 and Firefox 157 (Playwright 1.64.1 builds)
- [x] Wails v3.1.0 on Linux, WebKitGTK 6.0: dev server, packaged debug and release builds
- [x] Open shadow roots, teleported content, top-layer popovers, native modal dialogs
- [x] Views kept mounted behind `v-show`: their issues hide with them
- [ ] Exact template line and column mapping (only component-level ownership)
- [ ] Contents of closed shadow roots, cross-origin frames and canvas (select them whole
      or draw a region)
- [ ] Playwright WebKit (cannot launch on the development host)
- [ ] Windows and macOS WebViews (not tested)

## Prerequisites

To use it in an app:

- Node.js 20 or newer, for the Vite plugin, the Nuxt module and the `smegglect-bridge`
  command
- A browser or WebView with ES2022 modules, Shadow DOM and IndexedDB
- For the MCP server: the optional peer dependencies `@modelcontextprotocol/sdk` 1.32 and
  `zod` 4

To work on this repository:

- Bun 1.4, Node.js 22 (Playwright) and just
- Go 1.27 (`loc` from S99Locale through `tools/go.mod`, and the Wails fixture)
- Python 3 (the plain fixture's server and ZIP checks in tests)
- S99AB v2.0.0, installed from GitHub; the repository is private for now, so this needs
  SSH access to `github.com/smegg99/S99AB`
- For the Wails fixture: a C toolchain and the GTK 4 and WebKitGTK 6.0 development
  packages (`gtk4`, `webkitgtk-6.0` on Arch-based systems)

## Install

```sh
npm install -D smegglect
```

or `bun add -d smegglect`. `just pack` builds the same package as
`fixtures/pack/smegglect.tgz`, which installs the same way.

## Usage

### Vite

```ts
// vite.config.ts
import smegglect from 'smegglect/vite'

export default defineConfig({
  plugins: [
    vue(),
    smegglect({ project: { id: 'my-app' }, bridge: true }),
  ],
})
```

Active on the dev server. Add `debug: process.env.SMEGGLECT_DEBUG === '1'` to include it
in a build made with that variable. A `client` option names a module whose default export
returns extra mount options, such as a native save.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['smegglect/nuxt'],
  smegglect: { project: { id: 'my-app' }, bridge: true },
})
```

A client-only plugin in `nuxt dev`, or in a build with `debug: true`. It adds Vue
component ownership, the route name as the screen and the route as context.

### Any page

```ts
if (import.meta.env.DEV) {
  const { mount } = await import('smegglect')
  mount({ project: { id: 'my-app' } })
}
```

Guard the import with a build-time flag; a URL or `localStorage` check alone would still
ship the overlay. `mount()` is idempotent per `instance` name, and `destroy()` releases
every listener, observer, frame and object URL it created.

An app that switches views without changing the URL (a shell's own view state) names the
view with `screen: () => view.value`. Each issue then belongs to the view it was made in
and is not drawn on another.

### Wails

The Go side owns saving and the bridge: see `fixtures/wails/services/export.go`,
`fixtures/wails/services/bridge.go` and the `debug_on.go` / `debug_off.go` build-tag pair.
The frontend passes the generated bindings through `bindingSave` and `bindingBridge` from
`smegglect/wails`, which never imports the Wails runtime:

```ts
import { bindingBridge, bindingSave } from 'smegglect/wails'

mount({
  project: { id: 'my-app' },
  save: bindingSave((name, data) => Service.Save(name, data)),
  bridge: { label: 'My App', via: bindingBridge(request => Service.Bridge(request)) },
})
```

Run the broker beside the app with its origin admitted:

```sh
npx smegglect-bridge serve --root . --origin wails://wails
```

## Claude Code

Set it up once, in the project folder:

```sh
npm install -D @modelcontextprotocol/sdk zod
npx smegglect-bridge init
```

`init` adds the `smegglect` server to `.mcp.json` (other servers stay), installs the skill
to `.claude/skills/smegglect/SKILL.md`, adds `.smegglect/` to `.gitignore`, and prints the
plugin line. With `bridge: true` in the Vite plugin or the Nuxt module, the dev server
starts the broker when it starts listening and stops it when it closes.

Then report issues, press Send to Claude, and type `/smegglect` in Claude Code in the same
folder. Claude takes the open issues, fixes them, checks each one on the open page, says
what it did in the terminal, and keeps listening for the next report. The line above Send
to Claude says whether anyone is listening or working ("Claude is all ears", "Claude is on
it", "Claude stepped out 5 min ago", "Nobody is listening yet. Run /smegglect in Claude
Code"), and each sent
report shows where it stands ("Waiting for an agent", "Claude Code has it", "Done, see the
agent's terminal").

Each sent issue shows its own state: Waiting, Claude has it, Working on it, Fixed: check
it, Partly fixed, Blocked: see the terminal, or Stalled when Claude went quiet. When Claude
checks an issue on the page, its target pulses and the line says "Claude is checking issue
3". A result raises a toast ("Claude fixed issue 3: check it", with Show on page when the
target is on this page; several at once are summed up), and History lists each step:
Claude took the report, checked issue 3, marked issue 3 fixed. Only these fixed words
reach the page, never what Claude writes, and "Show the agent's status" in Settings turns
all of it off.

## Showcase

`showcase/` is Tabby, a small bill splitter on Nuxt 4, S99AB and Vuetify 4 that starts
with a deliberately poor UI: a clipped title, cramped cards, buttons too small to tap, an
oval button, a dropdown that should be a button group. It runs with Smegglect and the
agent bridge on:

```sh
just showcase        # http://127.0.0.1:5280
```

Open Claude Code in `showcase/`, run `/smegglect`, and report what you see.

## Settings

Settings is the last tab. Appearance: the language (Auto follows the app's `locale`
option, else the browser; English, Polski), the theme and the accent colour. Toolbar:
labels under the keys, larger keys, the same size on the side edges, animations, and the
Alt+Shift shortcuts. On the page: whether plates move out of the pointer's way. Agent:
whether the overlay shows the agent's progress (states, checks, toasts, History), and
"Only watch this page". Data: where drafts and history are kept, and clearing them.
Everything is remembered per project; a mount option fixes its setting instead.

## Keys

| Key | Action |
|---|---|
| Alt+Shift+S | unfold or fold the toolbar |
| Alt+Shift+P | pick elements |
| Alt+Shift+R | draw a region (turns Measure off) |
| Alt+Shift+M | show or hide measurements (leaves Region) |
| Alt+Shift+Z | undo the last add, edit or delete |
| Alt+Shift+Y | redo |
| Ctrl+Enter | add the issue being written |
| Ctrl+V | paste an image into the issue being written |
| Escape | step back one level; passed to the page when there is nothing to close |

Shortcuts are ignored while typing in text fields and during IME composition.

## Security and Captured Data

- Captured: tag, role, a bounded label, stable ids, allowlisted test attributes, cleaned
  class names, a structural path, rendered bounds, allowlisted computed properties,
  viewport and scroll, and the page's origin and path.
- Never captured: input, textarea or select values, query strings and fragments,
  arbitrary data attributes, HTML or application state.
- Secret-looking strings (JWTs, bearer tokens, API keys, long hex or base64 runs,
  `password=`-style pairs) are masked before storage and export.
- Images are attached by hand (chosen or pasted), stay in memory until approved, and are
  not redacted.
- Page text and agent results are shown as text, never as HTML, and are quoted as
  untrusted evidence in `task.md`.
- Drafts live in IndexedDB, which the host application can read. Shadow DOM is a styling
  boundary, not a security boundary.
- No telemetry. The only network requests go to the local bridge, when you turn it on.

The broker listens on 127.0.0.1 only, writes its address and a per-run token to
`.smegglect/bridge.json` (mode 0600), and accepts requests whose Host is its own loopback
address, whose Origin is admitted, and that carry the token. There is no wildcard CORS and
no file, shell or evaluation route. Any local process that can read `bridge.json` can call
it.

<details>
<summary><b>Agent bridge reference</b></summary>

The broker, the MCP server (`--root .` in `.mcp.json`), `smegglect-bridge wait` and the
page's source paths meet in one folder, the bridge root: by default the nearest folder from
the dev server's root upward whose `.mcp.json` has the smegglect server, else the dev
server's root. With the app in `frontend/`, running `init` in the project folder is enough;
the plugin and the module take `bridgeRoot` to choose another. A broker already running
for the project is reused, and a second dev server admits its own origins to it.

MCP tools:

- `next_work`: sent issues without an answer, each with its task, note, scope, target,
  source file and viewport. It claims them for the calling agent; `claim: false` only
  looks.
- `list_batches`, `get_batch`, `get_issue_evidence`, `get_attachment`
- `check_issue`: the open page finds the target again and measures it now. The answer says
  which page gave it, under which viewport, and for a target that is gone, what could have
  been it.
- `get_selection`: what is selected on the page.
- `report_result`: `in-progress`, `partial`, `blocked` or `needs-review`.

Every tool is also a command that prints the same JSON, for a session that started before
`init` wrote `.mcp.json`, or an agent without MCP: `smegglect-bridge work`, `batches`,
`batch`, `evidence`, `check`, `selection`, `attachment` and `report`. `smegglect-bridge
help` lists them with their options.

An agent silent for five minutes is gone: its claimed issues return to the queue and its
reports read Stalled. `bridge: { ..., observer: true }` makes a page that never answers
checks, for a second browser an automation opens on the same dev server.

</details>

<details>
<summary><b>Exported batch and entry points</b></summary>

`smegglect-<batch>.zip` holds `<batch>/batch.json` (schema `smegglect.batch`, version 1,
sorted keys), `<batch>/task.md`, `<batch>/followups.json` when there are follow-ups, and
`<batch>/attachments/<id>.<ext>` for approved images. `task.md` lists each issue with its
task sentence, scope, constraints, the note, A and B, and the captured evidence.

| Import | Runtime | Contents |
|---|---|---|
| `smegglect` | browser | `mount()`, `destroy()`, the bundled overlay |
| `smegglect/core` | any | batch model, validation, presets, geometry, redaction, task rendering, ZIP writer |
| `smegglect/dom` | browser | headless engine, owned host, storage, descriptors and resolution |
| `smegglect/vue` | browser | `vueSource()`, `routeContext()`, `routeScreen()`; no Vue import |
| `smegglect/wails` | browser | `bindingSave()`, `bindingBridge()` |
| `smegglect/vite` | Node | Vite plugin |
| `smegglect/nuxt` | Node | Nuxt module |
| `smegglect/bridge` | Node | broker and MCP server; the `smegglect-bridge` command |

</details>

## Development

```sh
just install          # bun install
just build            # the library and its type declarations in dist/
just showcase         # the showcase on http://127.0.0.1:5280
just lint             # ESLint
just typecheck        # vue-tsc
just i18n-check       # locale sources valid, generated bundles current
```

The tests and the consumer apps they run against are kept outside this repository.

`VERSION` holds the version; `just set-version 0.1.1` writes it and `package.json`.
Locale sources live in `i18n/locales/{en,pl}`; `just i18n` regenerates the overlay
bundles.
