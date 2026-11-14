// src/core/compare.ts
// Side-by-side values for the properties a preset compares, from stored or preview evidence.

import { px } from './geometry'
import type { TargetEvidence } from './model'
import type { PresetDef } from './presets'

export interface CompareRow {
  property: string
  values: string[]
  /** Values differ across columns, or (off-scale) the value is not on the scale. */
  flagged: boolean
}

export interface Comparison {
  columns: string[]
  rows: CompareRow[]
}

function value(
  evidence: { bounds: TargetEvidence['bounds'], properties: Record<string, string> },
  property: string,
): string {
  if (property === 'width') return `${px(evidence.bounds.width)}px`
  if (property === 'height') return `${px(evidence.bounds.height)}px`
  return evidence.properties[property] ?? ''
}

function memberValue(evidence: TargetEvidence, i: number, property: string): string {
  const bounds = evidence.members?.[i]
  if (property === 'width' && bounds) return `${px(bounds.width)}px`
  if (property === 'height' && bounds) return `${px(bounds.height)}px`
  return evidence.memberProperties?.[i]?.[property] ?? ''
}

/** The spacing scale an off-scale issue names, `grid-8` as 8; 4 when it names none. */
export function gridScale(params: Readonly<Record<string, string>>): number {
  return Number((params.scale ?? '').replace('grid-', '')) || 4
}

/** A value the page measured: `normal` and `auto` say nothing about a scale. */
const measured = (shown: string) => shown !== '' && shown !== 'normal' && shown !== 'auto'

/** Every px number in a value is a multiple of the scale (0 counts as on scale). */
export function onScale(text: string, scale: number): boolean {
  const pixels = [...text.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]))
  return pixels.every(amount => Math.abs(amount / scale - Math.round(amount / scale)) < 0.01)
}

export function compare(
  def: PresetDef | undefined,
  params: Record<string, string>,
  a: TargetEvidence,
  b?: TargetEvidence,
): Comparison | null {
  if (!def?.compare?.length) return null
  if (def.id === 'off-scale') {
    const scale = gridScale(params)
    const rows = def.compare.map(property => ({ property, shown: value(a, property) }))
      .filter(row => measured(row.shown))
      .map(({ property, shown }) => ({ property, values: [shown], flagged: !onScale(shown, scale) }))
    return { columns: ['A'], rows }
  }
  if (b) {
    return {
      columns: ['A', 'B'],
      rows: def.compare.map((property) => {
        const values = [value(a, property), value(b, property)]
        return { property, values, flagged: values[0] !== values[1] }
      }),
    }
  }
  const count = a.memberProperties?.length ?? a.members?.length ?? 0
  if (count < 2) {
    const rows = def.compare.map(property => ({ property, values: [value(a, property)], flagged: false }))
      .filter(row => row.values[0] !== '')
    return rows.length ? { columns: ['A'], rows } : null
  }
  return {
    columns: Array.from({ length: count }, (_column, i) => String(i + 1)),
    rows: def.compare.map((property) => {
      const values = Array.from({ length: count }, (_column, i) => memberValue(a, i, property))
      return { property, values, flagged: new Set(values).size > 1 }
    }),
  }
}
