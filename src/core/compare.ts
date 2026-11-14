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

function value(ev: { bounds: TargetEvidence['bounds'], properties: Record<string, string> }, property: string): string {
  if (property === 'width') return `${px(ev.bounds.width)}px`
  if (property === 'height') return `${px(ev.bounds.height)}px`
  return ev.properties[property] ?? ''
}

function memberValue(ev: TargetEvidence, i: number, property: string): string {
  const bounds = ev.members?.[i]
  if (property === 'width' && bounds) return `${px(bounds.width)}px`
  if (property === 'height' && bounds) return `${px(bounds.height)}px`
  return ev.memberProperties?.[i]?.[property] ?? ''
}

/** Every px number in a value is a multiple of the scale (0 counts as on scale). */
export function onScale(v: string, scale: number): boolean {
  const nums = [...v.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]))
  return nums.every(n => Math.abs(n / scale - Math.round(n / scale)) < 0.01)
}

export function compare(def: PresetDef | undefined, params: Record<string, string>, a: TargetEvidence, b?: TargetEvidence): Comparison | null {
  if (!def?.compare?.length) return null
  if (def.id === 'off-scale') {
    const scale = Number((params.scale ?? '').replace('grid-', '')) || 4
    const rows = def.compare.map((p) => {
      const v = value(a, p)
      return { property: p, values: [v], flagged: v !== '' && v !== 'normal' && v !== 'auto' && !onScale(v, scale) }
    }).filter(r => r.values[0] && r.values[0] !== 'normal' && r.values[0] !== 'auto')
    return { columns: ['A'], rows }
  }
  if (b) {
    return {
      columns: ['A', 'B'],
      rows: def.compare.map((p) => {
        const values = [value(a, p), value(b, p)]
        return { property: p, values, flagged: values[0] !== values[1] }
      }),
    }
  }
  const count = a.memberProperties?.length ?? a.members?.length ?? 0
  if (count < 2) {
    const rows = def.compare.map(p => ({ property: p, values: [value(a, p)], flagged: false })).filter(r => r.values[0] !== '')
    return rows.length ? { columns: ['A'], rows } : null
  }
  return {
    columns: Array.from({ length: count }, (_, i) => String(i + 1)),
    rows: def.compare.map((p) => {
      const values = Array.from({ length: count }, (_, i) => memberValue(a, i, p))
      return { property: p, values, flagged: new Set(values).size > 1 }
    }),
  }
}
