// src/core/redact.ts
// One redaction policy applied before anything is stored or exported.

import { LIMITS } from './limits'

export const REDACTED = '[redacted]'

/** `name: value` or `name=value` where the name says the value is a secret. */
const NAMED_SECRET = new RegExp(
  String.raw`\b(token|secret|password|passwd|pwd|api[_-]?key|access[_-]?key|auth|session|sid|otp)`
  + String.raw`(\s*[:=]\s*)`
  + String.raw`("[^"]*"|'[^']*'|\S+)`,
  'gi',
)

/** A run of 40 or more base64-ish characters holding a digit, a lower and an upper case letter. */
const TOKEN_CHAR = '[A-Za-z0-9+/_-]'
const LONG_MIXED_TOKEN = new RegExp(
  `(?<!${TOKEN_CHAR})(?=${TOKEN_CHAR}*\\d)(?=${TOKEN_CHAR}*[a-z])(?=${TOKEN_CHAR}*[A-Z])`
    + `${TOKEN_CHAR}{40,}={0,2}`,
  'g',
)

const SECRETS: readonly [RegExp, string | ((match: string, ...groups: string[]) => string)][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${REDACTED}`],
  [/\b(sk|pk|rk)[-_](live|test|proj|ant)?[-_]?[A-Za-z0-9]{16,}/g, REDACTED],
  [/\b(ghp|gho|ghs|ghu|github_pat|glpat|xox[abpr])[-_][A-Za-z0-9_-]{10,}/g, REDACTED],
  [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
  [/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, (_m, base: string) => base],
  [NAMED_SECRET, (_m, name: string, sep: string) => `${name}${sep}${REDACTED}`],
  [/\b[a-f0-9]{32,}\b/gi, REDACTED],
  [LONG_MIXED_TOKEN, REDACTED],
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
    const path = url.pathname.split('/')
      .map(seg => maskSecrets(seg) === seg && seg.length < 40 ? seg : REDACTED)
      .join('/')
    return `${url.protocol}//${url.host}${path}`
  }
  catch {
    // Not a URL the parser accepts: there is no origin or path to keep, so nothing of it is kept.
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
  for (const name of list) {
    if (out.length >= LIMITS.classes) break
    if (name.length <= 48 && !GENERATED_CLASS.test(name)) out.push(name)
  }
  return out
}

/** Fields whose strings are ids, which name records and files: a long random id is no token. */
const ID_FIELDS: ReadonlySet<string> = new Set(['id', 'batchId', 'issueId', 'project', 'attachments'])

/** A list's items are read as the field that holds the list. */
function scrubField(value: unknown, field: string | undefined): unknown {
  if (typeof value === 'string') return ID_FIELDS.has(field ?? '') ? value : maskSecrets(value)
  if (Array.isArray(value)) return value.map(item => scrubField(item, field))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubField(inner, key)]))
  }
  return value
}

/** Deep copy with secrets masked in every string but ids, for export and storage. */
export function scrub<T>(value: T): T {
  return scrubField(value, undefined) as T
}
