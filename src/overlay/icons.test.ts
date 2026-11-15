// src/overlay/icons.test.ts
// The button's paws are the drawings in assets/: an edited asset that was not copied here fails this test.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ICONS } from './icons'

/** The one path of an asset, with its whitespace collapsed as icons.ts stores it. */
function assetPath(file: string): string {
  const svg = readFileSync(`assets/${file}`, 'utf8')
  const paths = [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map(match => match[1] ?? '')
  expect(paths, file).toHaveLength(1)
  return (paths[0] ?? '').replace(/\s+/g, ' ').trim()
}

describe('the button icon', () => {
  it('is the cat paw from the assets, closed while folded and open while expanded', () => {
    expect(ICONS.pawClosed).toBe(assetPath('cat-paw-01-closed.svg'))
    expect(ICONS.pawOpen).toBe(assetPath('cat-paw-01-open.svg'))
  })
})

/** The logo's crab path, 1.5 times larger and moved 4.5 down: the 16 x 10 crab centred in 24 x 24. */
function scaled(d: string): string {
  let command = ''
  let at = 0
  return (d.match(/[MLHVZ]|-?\d+(?:\.\d+)?/g) ?? []).map((token) => {
    if (/[MLHVZ]/.test(token)) {
      command = token
      at = 0
      return token
    }
    const y = command === 'V' || (command !== 'H' && at++ % 2 === 1)
    return String(Number(token) * 1.5 + (y ? 4.5 : 0))
  }).join(' ')
}

describe('the Send to Claude icon', () => {
  it('is the crab from the Smegglect logo', () => {
    const svg = readFileSync('assets/smegglect.svg', 'utf8')
    const crab = /<path id="claude-crab"[^>]*\sd="([^"]+)"/.exec(svg)?.[1] ?? ''
    expect(ICONS.crab).toBe(scaled(crab))
  })
})
