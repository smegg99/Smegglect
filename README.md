# Smegglect

A development-only overlay for interfaces rendered with web technologies. You point at
elements in the running app, pick an outcome such as "match height" or "text clipped",
and export a batch of precise, direction-preserving tasks that a developer or a coding
agent can act on.

Built with TypeScript, Vue 3.5 (bundled inside the overlay), Vite 8 and S99Locale.
Optional adapters for Vite, Nuxt 4 and Wails v3.

## What It Does

`mount()` adds one `<smegglect-root>` element with an open shadow root to the page and
nothing else: no global styles, fonts, network requests or attributes on host elements.
The overlay is a small dock (pick, region, measure, show issues, undo, redo, issues and
more) and, while something is selected or open, one inspector panel at the side. In pick mode the next click selects an element instead of activating it; the
host's pointer, mouse, click and touch events are cancelled only while a pick, reference
or anchor mode is on.

### Workflow

1. Press Pick (Alt+Shift+P) and click an element, or Region (Alt+Shift+R) and drag.
   One click makes the selection and ends the mode, like a browser's inspect tool.
   Shift-click, or "Add to group with each pick", keeps picking on to build a group.
2. The inspector opens at the side of the page (a sheet at the top or bottom below
   720 px), with folder tabs for Element, Issues and History. It fits around the dock,
   which never moves for it. It names the selection and lists what can be reported
   about it as a tree: Size and space, Fit, Alignment, Look, Behaviour and access,
   Differs from another and Other (Look, Behaviour and access and Differs from another
   start folded; every branch remembers whether it is open). Each issue type appears
   once. Below the tree are issues already reported on that element and a folded
   Measurements branch (size, padding, margin, border, font, typeface, line height,
   colour and background). When the selection is under the inspector, the inspector
   moves to the other side; More > Inspector puts it on the left or right.
3. Choosing an action never records anything by itself. The inspector shows a form
   that says in one sentence what will be reported, offers a direction (for example
   "too narrow") and shows the computed styles it measured. Actions that compare two
   elements first ask for B, the reference; A is always the element to change. While
   the page is being clicked, the inspector shrinks to one line that says what to
   click.
4. Add issue (or Ctrl+Enter) records it. The same issue on the same element is refused
   with "Already reported as issue N".
5. Every issue stays on the page as a numbered plate above a dashed outline. Regions
   stay where they were drawn. Plates move up or down out of the pointer's way so the
   element under them can be seen, and stop moving once the pointer is on them. The X
   on a plate deletes the issue; clicking the plate opens it in the inspector.
6. The Issues tab lists everything by page, then submitted reports. The History tab
   shows what was added, edited, deleted, undone, redone, copied, exported and
   reviewed, newest first. Review report widens the inspector to show the whole batch
   as a summary or as Markdown, with Copy prompt and Download .zip.

Escape steps back one level at a time: an open menu, the issue form, waiting for B or
pick or region mode, an issue or the report, the selection, then the inspector. Closing
the inspector, or leaving its Element tab, also ends a half-made issue.

### Measure

Measure (Alt+Shift+M) is an on/off view that works in every mode, including normal use
of the app, where the page keeps every click. With nothing selected, pointing at an
element shows its size, its padding (green) and its margin (orange). With a selection,
pointing at another element shows the distance between them; pointing inside the
selection shows the inner element's distances to its edges; pointing at anything that
contains the selection shows the selection's distances to that container's edges.

Issue types: Size, Spacing, Too small to tap, Off the spacing scale; Text clipped,
Overflows its box, Overlaps another, Wraps badly; Align to another, Not centred, Match
height, Match width (and Align group, Equal gaps for groups); Hard to read, Wrong text,
Wrong colour, Icon problem; Behaviour, Missing state, Keyboard access, Screen reader
name; the "differs from another" checks below; Breaks at another size, Layout (regions)
and Note. Most offer a short choice, for example "Missing state: Focus ring".

"Differs from another" compares the computed styles of two elements, or of every member
of a group: padding, margin, gap, size, corner radius, text style, colour, or something
else (with a note). "Off the spacing scale" checks padding, margin, gap and size against
a 4 px or 8 px grid. Differing values are flagged in the issue form and in the report.

Measurements are rendered CSS pixels from `getBoundingClientRect()`, unrounded in the
data and rounded to 0.1 in labels; gaps, touching edges, overlaps and diagonal
separation are reported as different things.

Issues are drafts in IndexedDB (memory when unavailable), keyed by project and browser
tab, with a revision check so two windows never overwrite each other. The history is
kept in the same database (the latest 500 events per project). Copy prompt and Download
.zip submit the batch: its evidence is frozen and later notes are separate follow-up
records. The ZIP holds canonical `batch.json`, `task.md` and approved images. Everything
that leaves the app passes one redaction step.

The overlay theme follows the page (light or dark) unless set in More. Anything that
is on (a mode, a view, a toggle) shows the same soft accent tint, so neither theme has
inverted buttons.

### Support

- [x] Plain HTML page with no framework (compiled `dist/index.js`, no Vue in the host)
- [x] Vue 3 and Nuxt 4 hosts, with component-level ownership from Vue dev builds
- [x] Chromium 156 and Firefox 157 (Playwright 1.64.1 builds)
- [x] Wails v3.1.0 on Linux, WebKitGTK 6.0: dev server, packaged debug and release builds
- [x] Open shadow roots, teleported content, top-layer popovers
- [x] Native modal dialogs through keyboard shortcuts (the dock is inert while a modal is open)
- [ ] Exact template line and column mapping (only component-level ownership)
- [ ] Contents of closed shadow roots, cross-origin frames and canvas (select them whole or draw a region)
- [ ] Playwright WebKit (cannot launch on the development host)
- [ ] Windows and macOS WebViews (not tested)


## Prerequisites

For using the package: a browser or WebView with ES2022 modules, Shadow DOM and
IndexedDB. Nothing else at runtime.

For working on this repository:

- Bun 1.4 (dependencies and scripts)
- Node.js 22 (Playwright)
- just
- Go 1.27 (`loc` from S99Locale through `tools/go.mod`, and the Wails fixture)
- Python 3 (fixture static server and ZIP checks in tests)
- For the Wails fixture: a C toolchain, GTK 4 and WebKitGTK 6.0 development packages
  (`gtk4`, `webkitgtk-6.0` on Arch-based systems)

## Usage

The package is not published to a registry. `just release` runs every check and
writes `dist/release/<version>/smegglect-<version>.tgz` with its `SHA256SUMS`; install
that tarball as a dev dependency:

```sh
just release
bun add -D ./smegglect-0.1.0.tgz
```

### Vite

```ts
// vite.config.ts
import smegglect from 'smegglect/vite'

export default defineConfig({
  plugins: [
    vue(),
    smegglect({ project: { id: 'my-app' }, debug: process.env.SMEGGLECT_DEBUG === '1' }),
  ],
})
```

The plugin is active on the dev server. `vite build` includes Smegglect only when
`debug` is true at build time; nothing in a built page can switch it on. A `client`
option names a module whose default export returns extra mount options such as a
native save.

### Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['smegglect/nuxt'],
  smegglect: { project: { id: 'my-app' }, debug: process.env.SMEGGLECT_DEBUG === '1' },
})
```

Client-only plugin. Adds Vue component ownership, the route name as the screen, and
route name and path as context.

### Manual mount

```ts
if (import.meta.env.DEV) {
  const { mount } = await import('smegglect')
  mount({ project: { id: 'my-app' } })
}
```

Guard the import with a build-time flag. A URL or `localStorage` check alone would
still ship the runtime in release builds. `mount()` is idempotent per `instance` name
and `destroy()` releases every listener, observer, frame and object URL it created.

### Wails

The Go side owns the save: see `fixtures/wails/services/export.go` and the
`debug_on.go` / `debug_off.go` build-tag pair. The frontend passes the generated
binding through `bindingSave` from `smegglect/wails`, which never imports the Wails
runtime.

### Keys

| Key | Action |
|---|---|
| Alt+Shift+S | open or collapse the dock |
| Alt+Shift+P | pick elements |
| Alt+Shift+R | draw a region |
| Alt+Shift+M | show or hide measurements |
| Alt+Shift+Z | undo the last add, edit or delete |
| Alt+Shift+Y | redo |
| Ctrl+Enter | add the issue from the issue form |
| Escape | cancel the innermost Smegglect operation; passed to the page when there is none |

Shortcuts are ignored while typing in text fields and during IME composition.

## Entry Points

| Import | Runtime | Contents |
|---|---|---|
| `smegglect` | browser | `mount()`, `destroy()`, the bundled Vue overlay |
| `smegglect/core` | any | batch model, validation, presets, geometry, redaction, Markdown and JSON rendering, ZIP writer |
| `smegglect/dom` | browser | headless engine, owned host, storage adapters, descriptors and resolution |
| `smegglect/vue` | browser | `vueSource()`, `routeContext()`, `routeScreen()`; no Vue import |
| `smegglect/wails` | browser | `bindingSave()` |
| `smegglect/vite` | Node | Vite plugin |
| `smegglect/nuxt` | Node | Nuxt module |
| `smegglect/bridge` | Node | optional broker and MCP server; `smegglect-bridge` command |

`dist/index.js` is 253 kB (74 kB gzip) including the Vue runtime.

## Exported Batch

`smegglect-<batch>.zip` contains `<batch>/batch.json` (schema `smegglect.batch`,
version 1, sorted keys), `<batch>/task.md`, `<batch>/followups.json` when there are
follow-ups, and `<batch>/attachments/<id>.<ext>` for approved images. Entry names come
from validated ids only.

`task.md` lists each issue with its task sentence, scope, preservation constraints, the
reporter's note, A and B, and the captured evidence. It tells the reader that captured
text is untrusted data and that acceptance is a human decision.

## Security and Captured Data

- Captured: tag, role, a bounded label, stable ids, allowlisted test attributes,
  cleaned class names, a structural path, rendered bounds, allowlisted computed
  properties, viewport and scroll, origin and path of the page.
- Never captured: input, textarea or select values, query strings and fragments,
  arbitrary data attributes, HTML, application state.
- Secret-looking strings (JWTs, bearer tokens, API keys, long hex or base64 runs,
  `password=`-style pairs) are masked before storage and export.
- Images are attached by hand, stay in memory until approved, and are not redacted.
- Page text and agent results are rendered as text, never as HTML, and are quoted as
  untrusted evidence in `task.md`.
- Shadow DOM is a styling boundary, not a security boundary. Drafts in IndexedDB are
  readable by the host application.
- No telemetry and no network requests.

## Agent Bridge (optional)

Without the bridge, Copy prompt or the downloaded `task.md` is the hand-off. With it,
Claude Code (or another MCP client) reads the batches you send and reports back on each
issue. Set it up once in the app:

```sh
node node_modules/smegglect/dist/bridge-cli.js init
```

`init` adds the `smegglect` server to `.mcp.json` (other servers stay), installs the
skill to `.claude/skills/smegglect/SKILL.md`, adds `.smegglect/` to `.gitignore` and
prints the plugin line. It changes nothing when `.mcp.json` is not valid JSON or
Smegglect is not installed, and it never edits `vite.config`. The MCP server needs the
optional peer dependencies `@modelcontextprotocol/sdk` and `zod`; `init` says when they
are missing. Then turn the bridge on in the Vite plugin:

```ts
smegglect({ project: { id: 'my-app' }, bridge: true })
```

The dev server now starts the broker when it starts listening, admits its own origins
(`localhost` and `127.0.0.1` at its port) and stops the broker when it closes. A broker
already running for the project is used instead. Report issues, open Review report,
press "Make available to agent", then run Claude Code in the app folder and type
`/smegglect`.

The broker listens on 127.0.0.1 only, writes the address and a per-run token to
`.smegglect/bridge.json` (mode 0600) and stores sent batches, follow-ups and approved
images under `.smegglect/batches/`. It accepts requests whose Host is its own loopback
address, whose Origin is admitted (or absent, for local processes), and that carry the
token. There is no wildcard CORS and no file, shell or evaluation route. Only `vite
serve` passes the address and token to the page; builds never contain them. Stopping the
dev server with Ctrl+C can leave `bridge.json` behind; the next start replaces it.

The Nuxt module does not start the bridge. There, or with any other dev server, run the
broker yourself with the page's origin:

```sh
node node_modules/smegglect/dist/bridge-cli.js serve --root . --origin http://127.0.0.1:3000
```

Tools: `next_work` (sent issues without an answer and reopened ones, with what you said),
`list_batches`, `get_batch`, `get_issue_evidence`, `check_issue` (the open page finds the
target again and measures it now), `get_selection` (what you have selected on the page)
and `report_result`. An agent can report `in-progress`, `partial`, `blocked` or
`needs-review`; only a person accepts or reopens. The skill is in
`.claude/skills/smegglect/SKILL.md`; the package ships a copy that `init` installs.

The loop: after `/smegglect`, Claude takes the open issues, fixes them, checks them on
the open page and reports each one. Then it runs `smegglect-bridge wait` in the
background, which returns when you send more or reopen one, and starts over. Claude
listens only after `/smegglect`. On the page, results arrive by themselves while the
overlay is open; each issue Claude answered keeps a plate with its state until you
accept it, and is listed first in the Issues tab under "Agent results". Its issue view
has Accept and Reopen (with a reason and a note for Claude).

Tested with Claude Code 2.1.311 in a copy of the Vite fixture (`claude -p "/smegglect"`
with the project `.mcp.json`): Claude fixed sent issues, checked them on the open page,
asked through `blocked` when an issue was unclear, took a reopened issue with the
person's answer, and picked up issues sent later while it was listening.

Browsers record human reviews and processes without an Origin record agent results.
That separates the two channels; it is not strong identity, since any local process that
can read `.smegglect/bridge.json` can call the broker.

## Development

```sh
just install          # bun install
just dev              # playground fixtures on http://127.0.0.1:5199
just test             # unit tests
just e2e              # browser tests, Chromium and Firefox
just fixtures-test    # Vite, Nuxt and plain-page consumers of the packed tarball
just release-check    # release builds contain no Smegglect, debug builds do
just wails-build      # bin/desk, bin/desk-debug, bin/desk-dev in fixtures/wails
just demo             # run the desktop demo in packaged debug mode
just check            # everything above, plus lint, typecheck, version, locale and binding drift
just release          # just check, then the tarball and SHA256SUMS in dist/release/<version>
just set-version 0.1.1  # VERSION and package.json
```

`VERSION` holds the version; `just set-version` writes it and `package.json`, and the
bridge CLI reports it to MCP clients. Locale sources live in `i18n/locales/{en,pl}`;
`just i18n` regenerates the overlay bundles.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
