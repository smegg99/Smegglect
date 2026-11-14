// src/vite/git.ts

import { execFileSync } from 'node:child_process'

/** Branch, short commit and a dirty flag as optional provider evidence. Unknown stays absent. */
export function git(root: string): Record<string, string> {
  const run = (args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim()
    }
    catch {
      return ''
    }
  }
  const out: Record<string, string> = {}
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD'])
  const commit = run(['rev-parse', '--short', 'HEAD'])
  if (branch && branch !== 'HEAD') out.branch = branch
  if (commit) out.commit = commit
  if (commit && run(['status', '--porcelain'])) out.dirty = 'yes'
  return out
}
