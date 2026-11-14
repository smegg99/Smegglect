// src/core/sentences.test.ts
// A one-element issue type on a group says it holds for each member; group presets and single elements do not.
import { describe, expect, it } from 'vitest'
import type { ElementDescriptor, Issue } from './model'
import { createRegistry } from './presets'
import { intentSentence } from './sentences'
import { issue } from './validate.test'

const registry = createRegistry()
const member: ElementDescriptor = { tag: 'div', classes: [], path: [], shadowDepth: 0 }

function onGroup(id: string, params: Record<string, string> = {}): Issue {
  const base = issue()
  return issue({
    intent: { ...base.intent, preset: { id, version: 1 }, params },
    operands: { a: { kind: 'group', members: [member, member, member] } },
    evidence: { ...base.evidence, b: undefined },
  })
}

describe('task sentences for several elements', () => {
  it('say a one-element issue holds for each member', () => {
    expect(intentSentence(onGroup('size', { observed: 'too-wide' }), registry)).toBe(
      'Reported: A is too wide. Find what sets its size and correct it.'
      + ' A is a group of 3 elements: this holds for each of them.',
    )
  })

  it('leave group presets and one element as they were', () => {
    expect(intentSentence(onGroup('equal-gaps'), registry)).not.toContain('holds for each')
    expect(intentSentence(issue({ ...onGroup('size'), operands: issue().operands }), registry))
      .not.toContain('holds for each')
  })

  it('name the space a person picked while measuring', () => {
    const spaced = (space: string, observed?: string) => {
      const params: Record<string, string> = observed ? { space, observed } : { space }
      return intentSentence(issue({ intent: { ...issue().intent, preset: { id: 'spacing', version: 1 }, params } }), registry)
    }
    expect(spaced('padding-top', 'excessive')).toBe('Reported: the top padding of A is too large.')
    expect(spaced('margin-left', 'cramped')).toBe('Reported: the left margin of A is too small.')
    expect(spaced('padding-bottom')).toBe('Reported: the bottom padding of A is wrong. The note says how, when there is one.')
    expect(intentSentence(onGroup('spacing', { space: 'gap', observed: 'cramped' }), registry))
      .toBe('Reported: the gap between the members of A is too small.')
  })

  it('offer every one-element built-in preset for a group, the region-only layout aside', () => {
    const elementOnly = registry.list.filter(def => def.applies.includes('dom') && !def.applies.includes('group'))
    expect(elementOnly.map(def => def.id)).toEqual([])
    expect(registry.byId.get('layout')?.applies).toEqual(['region'])
  })
})
