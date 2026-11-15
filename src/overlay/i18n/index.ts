// src/overlay/i18n/index.ts
// Small translator over the S99Locale web bundles; vue-i18n would cost more than the overlay itself.

import { defaultLocale, locales } from './generated/keys.gen'
import { pluralRules } from './generated/plurals.gen'

type Tree = { [key: string]: string | Tree }
export type Locale = typeof locales[number]
export type Params = Record<string, string | number>

const files = import.meta.glob<Tree>('./generated/*/*.json', { eager: true, import: 'default' })

const bundles: Record<string, Tree> = {}
for (const [path, tree] of Object.entries(files)) {
  const locale = path.split('/')[2] as string
  bundles[locale] = { ...bundles[locale], ...tree }
}

export function pickLocale(wanted: readonly string[]): Locale {
  for (const tag of wanted) {
    const base = tag.toLowerCase().split('-')[0]
    const hit = locales.find(locale => locale === base)
    if (hit) return hit
  }
  return defaultLocale
}

function lookup(tree: Tree | undefined, key: string): string | undefined {
  let node: string | Tree | undefined = tree
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

export type Translate = (key: string, params?: Params) => string

/** Reads the locale on every call, so a component that renders with it follows a change at once. */
export function createTranslator(localeOf: () => Locale, onMissing: (key: string) => void): Translate {
  return (key, params = {}) => {
    const locale = localeOf()
    const raw = lookup(bundles[locale], key) ?? lookup(bundles[defaultLocale], key)
    if (raw === undefined) {
      onMissing(key)
      return ''
    }
    let text = raw
    if (raw.includes(' | ') && typeof params.count === 'number') {
      const bands = raw.split(' | ')
      const plural = pluralRules[locale] ?? pluralRules[defaultLocale]
      const band = plural ? bands[plural(params.count, bands.length)] : undefined
      text = band ?? raw
    }
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => name in params ? String(params[name]) : whole)
  }
}
