// src/dom/providers.ts
// Optional enrichment. Bounded in time, isolated from errors, filtered to named safe fields.

import type { ContextEntry, SourceRef } from '../core/model'
import { cleanText, maskSecrets } from '../core/redact'
import { checkSource } from '../core/validate'

export interface SourceProvider {
  name: string
  source: (element: Element) => SourceRef | null | Promise<SourceRef | null>
}

export interface ContextProvider {
  name: string
  /** Only these fields are kept from `read`; anything else is dropped. */
  fields: readonly string[]
  read: (signal: AbortSignal) => Record<string, unknown> | Promise<Record<string, unknown>>
}

/** Longest wait for one provider; a slower one is reported as timed out. */
const PROVIDER_TIMEOUT_MS = 250

export const VISUAL_ONLY: SourceRef = { quality: 'visual-only', provenance: 'none' }

async function bounded<T>(
  work: (signal: AbortSignal) => T | Promise<T>,
  ms: number,
): Promise<T | 'timeout' | 'failed'> {
  const ctl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(ctl.signal)),
      new Promise<'timeout'>((done) => {
        timer = setTimeout(() => done('timeout'), ms)
      }),
    ])
  }
  catch {
    // A provider that throws is reported as failed; enrichment never stops the capture it enriches.
    return 'failed'
  }
  finally {
    clearTimeout(timer)
    ctl.abort()
  }
}

export async function sourceOf(element: Element, providers: readonly SourceProvider[]): Promise<SourceRef> {
  for (const provider of providers) {
    const got = await bounded(() => provider.source(element), PROVIDER_TIMEOUT_MS)
    if (!got || got === 'timeout' || got === 'failed') continue
    const problems: string[] = []
    checkSource(got, provider.name, problems)
    if (problems.length) continue
    return { ...got, provenance: cleanText(got.provenance, 64) }
  }
  return VISUAL_ONLY
}

function safeValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') return cleanText(maskSecrets(value), 120)
  return undefined
}

export async function contextOf(providers: readonly ContextProvider[]): Promise<ContextEntry[]> {
  const out: ContextEntry[] = []
  for (const provider of providers) {
    const got = await bounded(signal => provider.read(signal), PROVIDER_TIMEOUT_MS)
    const name = cleanText(provider.name, 48)
    if (got === 'timeout' || got === 'failed' || !got || typeof got !== 'object') {
      out.push({ provider: name, fields: {}, status: got === 'timeout' ? 'timeout' : 'failed' })
      continue
    }
    const fields: ContextEntry['fields'] = {}
    for (const key of provider.fields.slice(0, 16)) {
      const value = safeValue((got as Record<string, unknown>)[key])
      if (value !== undefined) fields[cleanText(key, 48)] = value
    }
    out.push({ provider: name, fields })
  }
  return out
}
