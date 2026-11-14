// src/core/task.golden.test.ts
// task.md for a batch that reaches every sentence and every evidence line, byte for byte as it was written
// when the golden file was made: a rewrite of task.ts must not change one character of it.
import { describe, expect, it } from 'vitest'
import { BATCH_SCHEMA, BATCH_VERSION, type Batch, type ElementDescriptor, type Issue, type TargetEvidence } from './model'
import { createRegistry } from './presets'
import { renderMarkdown } from './task'
import { issue } from './validate.test'

const registry = createRegistry()

const button: ElementDescriptor = {
  tag: 'button', role: 'link', label: 'Save | "all"', id: 'save', testId: 'save-btn', classes: ['primary', 'wide'],
  path: ['body', 'main#app', 'form[test=order]'], occurrence: { index: 2, count: 5, item: 'Row *3*' }, shadowDepth: 1,
}
const plain: ElementDescriptor = { tag: 'div', classes: [], path: [], shadowDepth: 0 }

const rich: TargetEvidence = {
  bounds: { x: 10.25, y: 20, width: 100.5, height: 40 },
  members: [{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 12 }],
  transformed: true,
  properties: { 'padding-top': '8px', 'font-size': '14px', 'color': 'rgb(0, 0, 0)' },
  parent: { element: { ...plain, tag: 'section', label: 'Order' }, bounds: { x: 0, y: 0, width: 400, height: 300 } },
  source: {
    quality: 'exact', provenance: 'vite-transform', file: 'src/Order.vue', line: 12, column: 4,
    component: 'OrderForm', owners: ['OrderForm', 'App'],
  },
}

/** Each built-in preset with each of its options, and with none. */
function presetIssues(): Issue[] {
  const out: Issue[] = []
  for (const def of registry.list) {
    const values = def.choice ? [undefined, ...def.choice.options] : [undefined]
    for (const value of values) {
      const params: Record<string, string> = def.choice && value ? { [def.choice.key]: value } : {}
      const intent = { ...issue().intent, preset: { id: def.id, version: def.version }, params }
      out.push(issue({ id: `iss_${out.length + 1}`, seq: out.length + 1, status: 'submitted', intent }))
    }
  }
  return out
}

function evidenceIssues(): Issue[] {
  const base = issue({ status: 'submitted' })
  const group = issue({
    id: 'iss_group', seq: 900, status: 'submitted',
    intent: { ...base.intent, preset: { id: 'group-align', version: 1 }, params: { edge: 'left' } },
    operands: { a: { kind: 'group', members: [button, plain], anchor: 1 } },
    evidence: { ...base.evidence, a: rich, b: undefined },
  })
  const region = issue({
    id: 'iss_region', seq: 901, status: 'submitted',
    intent: { ...base.intent, preset: { id: 'layout', version: 1 }, params: {}, note: 'Line one\nLine two', scope: 'screen' },
    operands: { a: { kind: 'region', rect: { x: 1, y: 2, width: 300, height: 200 }, frame: 'document', boundary: 'manual' } },
    evidence: { ...base.evidence, a: { ...rich, members: undefined, parent: undefined }, b: undefined },
  })
  const related = issue({
    id: 'iss_related', seq: 902, status: 'submitted',
    intent: { ...base.intent, scope: 'component', constraints: ['keep-tokens', 'keep-text'] },
    operands: { a: { kind: 'dom', element: button }, b: { kind: 'dom', element: { ...button, label: 'Cancel' } } },
    attachments: ['att_in', 'att_gone', 'att_held'],
    evidence: {
      capture: { ...base.evidence.capture, screen: 'checkout', colorScheme: 'dark', scroll: { x: 0, y: 120.5 } },
      a: rich,
      b: { ...rich, transformed: false, properties: { 'padding-top': '12px' } },
      relation: {
        horizontal: { kind: 'gap', distance: 8 }, vertical: { kind: 'touch' }, diagonal: true,
        overlap: { x: 0, y: 0, width: 3, height: 4 },
        delta: { left: 1, right: -2, top: 3, bottom: 0, centerX: 0.5, centerY: -1.25, width: 4, height: -3 },
      },
      context: [
        { provider: 'route', fields: { name: 'checkout', step: 2, signed: true } },
        { provider: 'store', fields: {}, status: 'timeout' },
        { provider: 'empty', fields: {} },
      ],
    },
  })
  const unknown = issue({
    id: 'iss_unknown', seq: 903, status: 'submitted',
    intent: { ...base.intent, preset: { id: 'project.gone', version: 7 } },
  })
  const held = issue({
    id: 'iss_held', seq: 904, status: 'submitted',
    intent: { ...base.intent, preset: { id: 'note', version: 1 }, params: {}, note: 'These two' },
    operands: { a: { kind: 'region', rect: { x: 0, y: 0, width: 240, height: 90 }, frame: 'document', boundary: 'manual' } },
    evidence: {
      ...base.evidence,
      b: undefined,
      a: {
        bounds: { x: 0, y: 0, width: 240, height: 90 }, transformed: false, properties: {},
        source: { quality: 'visual-only', provenance: 'none' },
        contents: {
          mode: 'touching',
          elements: [
            { element: button, bounds: { x: 4, y: 4, width: 80, height: 30 }, source: rich.source },
            { element: plain, bounds: { x: 90, y: 4, width: 80, height: 30 }, source: { quality: 'visual-only', provenance: 'none' } },
          ],
          total: 5,
        },
      },
    },
  })
  return [group, region, related, unknown, held]
}

function goldenBatch(): Batch {
  const attachment = (id: string, review: 'approved' | 'pending', mime: string) => ({
    id, issueId: 'iss_related', name: `${id} shot.png`, mime, size: 1234, review, createdAt: '2026-11-14T00:00:00Z',
  })
  return {
    schema: BATCH_SCHEMA, version: BATCH_VERSION, id: 'bat_golden', project: { id: 'demo', name: 'Demo *app*' },
    window: { id: 'win_golden' }, status: 'submitted', createdAt: '2026-11-14T00:00:00Z',
    submittedAt: '2026-11-14T01:00:00Z', provider: { branch: 'main', commit: 'abc123' },
    issues: [...presetIssues(), ...evidenceIssues()],
    attachments: [
      attachment('att_in', 'approved', 'image/png'),
      attachment('att_gone', 'approved', 'image/jpeg'),
      attachment('att_held', 'pending', 'image/webp'),
    ],
  }
}

describe('task.md golden file', () => {
  it('renders the golden batch exactly as before', async () => {
    const markdown = renderMarkdown({
      batch: goldenBatch(),
      registry,
      included: new Set(['att_in']),
      followUps: [
        {
          id: 'fol_1', batchId: 'bat_golden', issueId: 'iss_related', kind: 'note', actor: 'human',
          createdAt: '2026-11-14T02:00:00Z', text: 'Still wrong\non mobile',
        },
        {
          id: 'res_1', batchId: 'bat_golden', issueId: 'iss_related', kind: 'result', actor: 'agent',
          createdAt: '2026-11-14T03:00:00Z', text: 'Done | see *diff*', state: 'needs-review',
        },
      ],
    })
    await expect(markdown).toMatchFileSnapshot('./__golden__/task.md')
  })
})
