# justfile

loc := "go -C tools tool loc"

# List available commands.
default:
    @just --list

# Install JavaScript dependencies.
install:
    bun install

# Run the playground fixtures on http://127.0.0.1:5199.
dev:
    bun run dev

# Generate the overlay locale bundles from i18n/.
i18n:
    {{loc}} build -c ../i18n/config.cue

# Fail when locale sources are invalid or the generated bundles are stale.
i18n-check:
    {{loc}} check -c ../i18n/config.cue

# Build the browser library and its type declarations.
build:
    bun run build

# Type-check sources, playground and tests.
typecheck:
    bun run typecheck

# Lint TypeScript and Vue sources.
lint:
    bun run lint

# Run unit tests.
test:
    bun run test

# Run the bridge and MCP protocol tests against the built CLI.
bridge-test: build
    node_modules/.bin/vitest run --config tests/bridge/vitest.config.ts --root .

# Run real-browser tests in Chromium and Firefox.
e2e: build
    bun run e2e

# Pack the SDK and reinstall it into every consumer fixture from that tarball only.
fixtures: build
    rm -f fixtures/pack/smegglect.tgz
    bun pm pack --filename fixtures/pack/smegglect.tgz --quiet
    for f in vite-vue nuxt plain wails/frontend; do (cd fixtures/$f && rm -rf node_modules/smegglect node_modules/.vite .nuxt bun.lock && bun install --silent); done

# Run the consumer fixtures (Vite, Nuxt, plain page) in Chromium and Firefox.
fixtures-test: fixtures
    node_modules/.bin/playwright test --config playwright.fixtures.config.ts

# Check that release builds contain no Smegglect and explicit debug builds do.
release-check: fixtures
    bun scripts/release-check.ts

# Regenerate the Wails fixture bindings, including the debug-only save service.
wails-bindings:
    cd fixtures/wails && GOFLAGS=-tags=smegglect go tool wails3 generate bindings -clean -ts -d frontend/bindings

# Fail when the committed Wails bindings differ from a fresh generation.
wails-bindings-check:
    #!/usr/bin/env bash
    set -euo pipefail
    out=$(mktemp -d)
    trap 'rm -rf -- "$out"' EXIT
    cd fixtures/wails
    GOFLAGS=-tags=smegglect go tool wails3 generate bindings -clean -ts -d "$out" >/dev/null
    diff -r "$out" frontend/bindings

# Go format, vet and tests for the Wails fixture, with and without the debug tag.
wails-test:
    cd fixtures/wails && test -z "$(gofmt -l .)"
    cd fixtures/wails && go vet -tags smegglect ./... 2>/dev/null && go test -tags smegglect ./... && go test ./...

# Build bin/desk (release), bin/desk-debug (packaged debug) and bin/desk-dev (dev server) for the Wails fixture.
wails-build: fixtures
    cd fixtures/wails/frontend && rm -rf dist && SMEGGLECT_DEBUG=1 node_modules/.bin/vite build
    cd fixtures/wails && go build -tags production,smegglect -o bin/desk-debug .
    cd fixtures/wails/frontend && rm -rf dist && node_modules/.bin/vite build
    cd fixtures/wails && go build -tags production -o bin/desk .
    cd fixtures/wails && go build -tags smegglect -o bin/desk-dev .

# Check that the release binary has no Smegglect runtime or save handler.
wails-release-check: wails-build
    bun scripts/wails-release-check.ts

# Run the demo desktop app with Smegglect in packaged debug mode (no dev server).
demo: wails-build
    cd fixtures/wails && ./bin/desk-debug

# Set the version everywhere it is stamped, e.g. just set-version 0.1.1.
set-version ver:
    node scripts/sync-version.mjs "{{ver}}"

# Fail when package.json has drifted from VERSION.
check-version:
    node scripts/sync-version.mjs --check

# Run every repository check.
check: check-version i18n-check lint typecheck test bridge-test e2e fixtures-test release-check wails-bindings-check wails-test wails-release-check

# Run every check, then pack smegglect-VERSION.tgz and SHA256SUMS into dist/release/VERSION.
release: check
    #!/usr/bin/env bash
    set -euo pipefail
    version="$(tr -d '\r\n' < VERSION)"
    out="dist/release/${version}"
    # Packed outside dist first: the package ships dist, and must not ship its own release folder.
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    bun pm pack --filename "$tmp/smegglect-${version}.tgz" --quiet > /dev/null
    rm -rf "$out"
    mkdir -p "$out"
    mv "$tmp/smegglect-${version}.tgz" "$out/"
    (cd "$out" && sha256sum "smegglect-${version}.tgz" > SHA256SUMS)
    echo "$out"
