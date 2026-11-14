// scripts/wails-release-check.ts
// W03 for the native fixture: the release binary embeds no Smegglect runtime and links no save handler.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const dir = 'fixtures/wails/bin'

function inspect(name: string) {
  const bin = readFileSync(`${dir}/${name}`).toString('latin1')
  const symbols = execFileSync('go', ['tool', 'nm', `${dir}/${name}`], { maxBuffer: 256 << 20 }).toString()
  return {
    runtime: (bin.match(/smegglect-root/g) ?? []).length,
    batch: (bin.match(/smegglect\.batch/g) ?? []).length,
    handler: symbols.split('\n').filter(l => l.includes('services.(*ExportService)')).length,
  }
}

const release = inspect('desk')
const debug = inspect('desk-debug')
const ok = release.runtime === 0 && release.batch === 0 && release.handler === 0 && debug.runtime > 0 && debug.handler > 0
console.log(`${ok ? 'PASS' : 'FAIL'} wails: release ${JSON.stringify(release)}, debug ${JSON.stringify(debug)}`)
process.exit(ok ? 0 : 1)
