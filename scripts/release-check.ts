// scripts/release-check.ts
// W03 for web fixtures: release builds contain no Smegglect; explicit debug builds do.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MARKERS = ['smegglect-root', 'smegglect.batch', 'virtual:smegglect-client', 'smegglect:prefs']

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

function hits(dir: string): string[] {
  return files(dir).filter((f) => {
    const text = readFileSync(f, 'latin1')
    return MARKERS.some(m => text.includes(m))
  })
}

/** Builds quietly; a build that fails shows its own output, then stops the check. */
function build(cwd: string, cmd: string[], debug: boolean, out: string) {
  rmSync(join(cwd, out), { recursive: true, force: true })
  const env = { ...process.env, SMEGGLECT_DEBUG: debug ? '1' : '' }
  const done = spawnSync(cmd[0]!, cmd.slice(1), { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20 })
  if (done.status === 0) return
  process.stdout.write(done.stdout ?? '')
  process.stderr.write(done.stderr ?? '')
  const why = done.error?.message ?? (done.signal ? `signal ${done.signal}` : `exit ${done.status}`)
  throw new Error(`${debug ? 'debug' : 'release'} build failed in ${cwd}: ${cmd.join(' ')} (${why})`)
}

const cases = [
  { name: 'vite-vue', cwd: 'fixtures/vite-vue', cmd: ['node_modules/.bin/vite', 'build'], out: 'dist' },
  { name: 'nuxt', cwd: 'fixtures/nuxt', cmd: ['node_modules/.bin/nuxt', 'generate'], out: '.output' },
]

let failed = false
for (const c of cases) {
  build(c.cwd, c.cmd, false, c.out)
  const release = hits(join(c.cwd, c.out))
  build(c.cwd, c.cmd, true, c.out)
  const debug = hits(join(c.cwd, c.out))
  const ok = release.length === 0 && debug.length > 0
  failed ||= !ok
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: release files with markers ${release.length}, debug files with markers ${debug.length}`)
  for (const f of release) console.log(`  release contains Smegglect: ${f}`)
  build(c.cwd, c.cmd, false, c.out)
}
process.exit(failed ? 1 : 0)
