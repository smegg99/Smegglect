// src/core/validate.test.ts
import { describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch, type Issue } from './model'
import { createRegistry } from './presets'
import { checkBatch, checkIssueAlone, checkSource } from './validate'

const el = { tag: 'button', classes: [], path: ['body', 'main'], shadowDepth: 0, label: 'Save' }
const ev = { bounds: { x: 0, y: 0, width: 10, height: 10 }, transformed: false, properties: {}, source: { quality: 'visual-only', provenance: 'none' } }
const capture = { frame: 'viewport', units: 'css-px', viewport: { width: 100, height: 100 }, scroll: { x: 0, y: 0 }, devicePixelRatio: 1, visualScale: 1, colorScheme: 'light', location: 'http://x/', capturedAt: '2026-11-14T00:00:00Z' }

export function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: 'iss_1', seq: 1, status: 'draft', createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z',
    intent: { preset: { id: 'match-height', version: 1 }, params: {}, scope: 'occurrence', constraints: [], note: '' },
    operands: { a: { kind: 'dom', element: el }, b: { kind: 'dom', element: { ...el, label: 'Cancel' } } },
    evidence: { capture, a: ev, b: ev, context: [] },
    attachments: [],
    ...over,
  } as Issue
}

describe('validation', () => {
  const registry = createRegistry()

  it('accepts a complete directional issue', () => {
    expect(checkIssueAlone(issue(), registry).ok).toBe(true)
  })

  it('rejects a reference preset without operand B', () => {
    const bad = issue()
    delete bad.operands.b
    delete bad.evidence.b
    const res = checkIssueAlone(bad, registry)
    expect(res.ok).toBe(false)
    expect(!res.ok && res.problems.join()).toMatch(/needs a reference operand/)
  })

  it('rejects reference evidence without a reference operand', () => {
    const bad = issue()
    delete bad.operands.b
    expect(checkIssueAlone(bad).ok).toBe(false)
  })

  it('rejects invalid source confidence', () => {
    const out: string[] = []
    checkSource({ quality: 'exact', provenance: 'vue-instance' }, 's', out)
    expect(out.join()).toMatch(/needs a file/)
    const out2: string[] = []
    checkSource({ quality: 'visual-only', provenance: 'none', file: 'src/a.vue', line: 3 }, 's', out2)
    expect(out2.join()).toMatch(/cannot carry a location/)
    const out3: string[] = []
    checkSource({ quality: 'exact', provenance: 'x', file: '/home/me/a.vue', line: 1 }, 's', out3)
    expect(out3.join()).toMatch(/project-relative/)
    const out4: string[] = []
    checkSource({ quality: 'guess', provenance: 'x' }, 's', out4)
    expect(out4.length).toBe(1)
  })

  it('checks batch identity, version and attachment references', () => {
    const batch: Batch = {
      schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_1', project: { id: 'demo' }, window: { id: 'win_1' },
      status: 'draft', createdAt: '2026-11-14T00:00:00Z', issues: [issue({ attachments: ['att_x'] })], attachments: [],
    }
    const res = checkBatch(batch, registry)
    expect(!res.ok && res.problems.join()).toMatch(/unknown att_x/)
    expect(checkBatch({ ...batch, version: 2, issues: [] }).ok).toBe(false)
    expect(checkBatch({ ...batch, id: '../etc', issues: [] }).ok).toBe(false)
  })

  it('keeps unknown presets readable', () => {
    const custom = issue({ intent: { preset: { id: 'project.unknown', version: 3 }, params: {}, scope: 'occurrence', constraints: [], note: '' } })
    expect(checkIssueAlone(custom, registry).ok).toBe(true)
  })
})
