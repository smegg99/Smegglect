// src/core/redact.ts
// One redaction policy applied before anything is stored or exported.

import { LIMITS } from './validate'

export const REDACTED = '[redacted]'

const SECRETS: readonly [RegExp, string | ((m: string, ...g: string[]) => string)][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\b(sk|pk|rk)[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}/g, REDACTED],
  [/\b(ghp|gho|ghs|ghu|github_pat|glpat|xox[abpr])[-_][A-Za-z0-9_-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, (_m, base: string) => base],
  [/\b(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|auth|session|sid|otp)(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
    (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`],
  [/\b[a-f0-9]{32,}\b/gi, REDACTED],
  [/(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{40,}={0,2}/g, REDACTED],
]

export function maskSecrets(text: string): string {
  let out = text
  for (const [re, by] of SECRETS) out = out.replace(re, by as string)
  return out
}

/** Collapses whitespace, removes control characters, masks secrets and bounds the length. */
export function cleanText(text: string, max: number = LIMITS.label): string {
  // eslint-disable-next-line no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  const masked = maskSecrets(flat)
  return masked.length > max ? `${masked.slice(0, max - 3)}...` : masked
}

/** Origin and path only. Userinfo, query and hash never leave the page. */
export function cleanLocation(href: string): string {
  try {
    const url = new URL(href)
    if (url.protocol === 'data:' || url.protocol === 'blob:') return `${url.protocol}`
    const path = url.pathname.split('/').map(seg => maskSecrets(seg) === seg && seg.length < 40 ? seg : REDACTED).join('/')
    return `${url.protocol}//${url.host}${path}`
  }
  catch {
    return ''
  }
}

// A hash suffix contains a digit; `save-button` is a name, `btn-a1b2c` is not.
const GENERATED_ID = /(\d{3,}|^[a-f0-9-]{16,}$|^:|^v-|^data-v|^__|[_-](?=[a-z]*\d)[a-z0-9]{5,}$)/i

/** Ids from frameworks (`:r1:`, `v-123`, uuids) change between renders and are not identity. */
export function stableId(id: string): string | undefined {
  if (!id || id.length > 64 || GENERATED_ID.test(id) || maskSecrets(id) !== id) return undefined
  return id
}

const GENERATED_CLASS = /(^css-|^jsx-|^sc-|^_|^data-v|[_-](?=[a-z]*\d)[a-z0-9]{5,}$|\d{3,})/i

export function cleanClasses(list: Iterable<string>): string[] {
  const out: string[] = []
  for (const c of list) {
    if (out.length >= LIMITS.classes) break
    if (c.length <= 48 && !GENERATED_CLASS.test(c)) out.push(c)
  }
  return out
}

/** Deep copy with secrets masked in every string, for export and storage. */
export function scrub<T>(value: T): T {
  if (typeof value === 'string') return maskSecrets(value) as T
  if (Array.isArray(value)) return value.map(v => scrub(v)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v)
    return out as T
  }
  return value
}
