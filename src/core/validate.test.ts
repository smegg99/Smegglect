// src/core/validate.test.ts
import { describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch, type Issue } from './model'
import { createRegistry } from './presets'
import { checkBatch, checkIssue, checkSource } from './validate'

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
  const problems = (value: unknown, presets = registry) => checkIssue(value, 'issue', [], presets).join('; ')

  it('accepts a complete directional issue', () => {
    expect(problems(issue())).toBe('')
  })

  it('rejects a reference preset without operand B', () => {
    const bad = issue()
    delete bad.operands.b
    delete bad.evidence.b
    expect(problems(bad)).toMatch(/needs a reference operand/)
  })

  it('rejects reference evidence without a reference operand', () => {
    const bad = issue()
    delete bad.operands.b
    expect(problems(bad, undefined)).toMatch(/evidence without a reference operand/)
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
    expect(problems(custom)).toBe('')
  })

  it('refuses the evidence task.md reads when it has the wrong shape', () => {
    const base = issue()
    const evidence = (over: Record<string, unknown>) => issue({ evidence: { ...base.evidence, ...over } as Issue['evidence'] })
    const a = (over: Record<string, unknown>) => evidence({ a: { ...ev, ...over } })
    const broken: [Issue, RegExp][] = [
      [evidence({ capture: { ...capture, viewport: 'wide' } }), /capture.viewport/],
      [evidence({ capture: { ...capture, scroll: undefined } }), /capture.scroll/],
      [evidence({ capture: { ...capture, location: 3 } }), /capture.location/],
      [evidence({ context: [{ provider: 'git', fields: { branch: { nested: 1 } } }] }), /context/],
      [evidence({ context: [{ provider: 'git', fields: {}, status: 'lost' }] }), /context/],
      [evidence({ relation: { horizontal: { kind: 'gap' }, vertical: { kind: 'touch' }, diagonal: false, overlap: null, delta: {} } }), /relation/],
      [a({ parent: { element: { tag: 'div' }, bounds: { x: 0, y: 0, width: 1, height: 1 } } }), /parent.element/],
      [a({ parent: 'section' }), /parent.element/],
      [a({ members: [{ x: 0 }] }), /members\[0\]/],
      [a({ source: { quality: 'component', provenance: 'vue', component: 'X', owners: 'X' } }), /owners/],
    ]
    for (const [bad, problem] of broken) expect(problems(bad)).toMatch(problem)
    const context = [{ provider: 'git', fields: { branch: 'main', dirty: true, ahead: 2 } }, { provider: 'api', fields: {}, status: 'timeout' }]
    const relation = { horizontal: { kind: 'gap', distance: 4 }, vertical: { kind: 'touch' }, diagonal: false, overlap: null, delta: { left: 1, right: 1, top: 0, bottom: 0, centerX: 1, centerY: 0, width: 0, height: 0 } }
    expect(problems(evidence({ context, relation }))).toBe('')
  })

  describe("a region's contents", () => {
    const rect = { x: 0, y: 0, width: 200, height: 100 }
    const listed = { element: el, bounds: { x: 10, y: 10, width: 50, height: 20 }, source: { quality: 'component', provenance: 'vue-instance', component: 'SaveButton', file: 'src/Save.vue' } }
    const region = (contents: unknown) => issue({
      intent: { preset: { id: 'note', version: 1 }, params: {}, scope: 'occurrence', constraints: [], note: 'x' },
      operands: { a: { kind: 'region', rect, frame: 'document', boundary: 'manual' } },
      evidence: { capture, a: { ...ev, bounds: rect, contents }, context: [] } as Issue['evidence'],
    })

    it('pass when well formed', () => {
      expect(problems(region({ mode: 'inside', elements: [listed], total: 1 }), undefined)).toBe('')
    })

    it('are refused with an unknown mode, too many elements, a short total, or a malformed element', () => {
      const broken: unknown[] = [
        { mode: 'window', elements: [listed], total: 1 },
        { mode: 'inside', elements: Array.from({ length: 65 }, () => listed), total: 65 },
        { mode: 'touching', elements: [listed, listed], total: 1 },
        { mode: 'inside', elements: [{ ...listed, element: { tag: 'div' } }], total: 1 },
        { mode: 'inside', elements: [{ ...listed, bounds: 'wide' }], total: 1 },
        { mode: 'inside', elements: [], total: 0 },
        'all of it',
      ]
      for (const contents of broken) expect(problems(region(contents), undefined)).toMatch(/contents/)
    })

    it('are refused on a target that is not a region', () => {
      const dom = issue({ evidence: { capture, a: { ...ev, contents: { mode: 'inside', elements: [listed], total: 1 } }, b: ev, context: [] } as Issue['evidence'] })
      expect(problems(dom)).toMatch(/contents/)
    })
  })

  it('takes only image types an attachment may have, by their own name', () => {
    const attachment = { id: 'att_1', issueId: 'iss_1', name: 'shot.png', mime: 'image/png', size: 10, review: 'approved', createdAt: '2026-11-14T00:00:00Z' }
    const batch = (over: Record<string, unknown>) => ({
      schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_1', project: { id: 'demo' }, window: { id: 'win_1' },
      status: 'draft', createdAt: '2026-11-14T00:00:00Z', issues: [issue({ attachments: ['att_1'] })], attachments: [{ ...attachment, ...over }],
    })
    expect(checkBatch(batch({}), registry).ok).toBe(true)
    for (const mime of ['constructor', 'toString', '__proto__', 'text/html', 'image/svg+xml', 3]) {
      const res = checkBatch(batch({ mime }), registry)
      expect(!res.ok && res.problems.join()).toMatch(/mime/)
    }
    expect(checkBatch(batch({ size: 6 * 1024 * 1024 }), registry).ok).toBe(false)
  })
})
