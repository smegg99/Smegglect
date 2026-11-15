// src/overlay/evidence-text.ts
// An issue's evidence as the issue view shows it: short plain-text lines, one function per part.
// Captured strings stay data; nothing here is markup.

import { px } from '../core/geometry'
import type { AxisRelation, CaptureConditions, Evidence, Rect, Relation, SourceRef, TargetEvidence } from '../core/model'

const rectText = (rect: Rect) => `${px(rect.x)}, ${px(rect.y)}  ${px(rect.width)} x ${px(rect.height)}`

/** `A  x, y  w x h`, marked when the bounds are a transformed element's rendered ones. */
function boundsLine(letter: string, target: TargetEvidence, rendered: string): string {
  const mark = target.transformed ? `  (${rendered})` : ''
  return `${letter}  ${rectText(target.bounds)}${mark}`
}

function axisText(axis: AxisRelation): string {
  return axis.kind === 'touch' ? 'touch' : `${axis.kind} ${px(axis.distance)}`
}

function relationLines(relation: Relation): string[] {
  const { delta } = relation
  const deltas = `dw ${px(delta.width)}  dh ${px(delta.height)}  dx ${px(delta.left)}  dy ${px(delta.top)}`
  const diagonal = relation.diagonal ? '  diagonal' : ''
  const separation = `h ${axisText(relation.horizontal)}  v ${axisText(relation.vertical)}${diagonal}`
  return [`B - A  ${deltas}`, separation]
}

/** `source quality  file:line  <Component>`, as much as is known. */
function sourceLine(source: SourceRef): string {
  const parts = [`source ${source.quality}`]
  if (source.file) parts.push(source.line ? `${source.file}:${source.line}` : source.file)
  if (source.component) parts.push(`<${source.component}>`)
  return parts.join('  ')
}

function captureLine(capture: CaptureConditions): string {
  const { viewport, devicePixelRatio, colorScheme } = capture
  return `viewport ${viewport.width} x ${viewport.height}  dpr ${devicePixelRatio}  ${colorScheme}`
}

/** `rendered` is the translated word for a transformed element's bounds. */
export function evidenceText(evidence: Evidence, rendered: string): string {
  const lines = [boundsLine('A', evidence.a, rendered)]
  if (evidence.b) lines.push(boundsLine('B', evidence.b, rendered))
  if (evidence.relation) lines.push(...relationLines(evidence.relation))
  lines.push(sourceLine(evidence.a.source), captureLine(evidence.capture))
  return lines.join('\n')
}
