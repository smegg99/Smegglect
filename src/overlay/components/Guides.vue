<!-- src/overlay/components/Guides.vue -->
<template>
  <svg
    class="guides"
    aria-hidden="true"
    :viewBox="`0 0 ${ui.viewport.width} ${ui.viewport.height}`"
    preserveAspectRatio="none"
    :width="ui.viewport.width"
    :height="ui.viewport.height"
  >
    <rect
      v-for="(m, i) in geo.members"
      :key="`m${i}`"
      class="box member"
      :class="{ 'member-on': ui.member === i }"
      v-bind="box(m)"
    />
    <rect
      v-if="geo.a && sel !== 'region'"
      class="box a-halo"
      v-bind="box(geo.a)"
    />
    <rect
      v-if="geo.a && sel !== 'region'"
      class="box a"
      v-bind="box(geo.a)"
    />
    <rect
      v-if="geo.a && sel === 'region'"
      class="box region"
      v-bind="box(geo.a)"
    />
    <path
      v-if="geo.a && sel === 'dom'"
      class="bracket"
      :d="brackets(geo.a)"
    />
    <rect
      v-if="state.composing?.bBounds"
      class="box b"
      v-bind="box(state.composing.bBounds)"
    />
    <rect
      v-if="geo.region"
      class="box region"
      v-bind="box(geo.region)"
    />
    <rect
      v-if="cand"
      class="box cand"
      v-bind="box(cand)"
    />
    <rect
      v-for="(o, i) in drawing.boxes"
      :key="`o${i}`"
      class="box"
      :class="o.kind === 'over' ? 'dist over' : o.kind"
      v-bind="box(o.rect)"
    />
    <line
      v-for="(l, i) in drawing.lines"
      :key="`l${i}`"
      :class="l.kind === 'tick' ? 'tick' : l.kind === 'edge' ? 'edge' : l.kind === 'over' ? 'dist over' : 'dist'"
      :x1="l.x1"
      :y1="l.y1"
      :x2="l.x2"
      :y2="l.y2"
    />
  </svg>
  <div
    v-if="candLabel"
    class="measure-label hover"
    :style="candLabel.end ? atEnd(candLabel.x, candLabel.y) : at(candLabel.x, candLabel.y, 'above')"
  >
    {{ candLabel.text }}
  </div>
  <div
    v-if="sizeLabel"
    class="measure-label"
    :style="at(sizeLabel.x, sizeLabel.y, 'below')"
  >
    {{ sizeLabel.text }}
  </div>
  <div
    v-for="(l, i) in drawing.labels"
    :key="`t${i}`"
    class="measure-label"
    :class="l.kind"
    :style="at(l.x, l.y, 'center')"
  >
    {{ l.text }}
  </div>
  <template v-if="(refMode || state.composing?.bBounds) && geo.a">
    <span
      class="letter a"
      :style="corner(geo.a)"
    >A</span>
    <span
      v-if="cand || state.composing?.bBounds"
      class="letter b"
      :style="corner((cand ?? state.composing?.bBounds)!)"
    >B</span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { px } from '../../core/geometry'
import type { Rect } from '../../core/model'
import { boxGuides, edgeGuide, extents, inset, merge, pairwise, type Drawing } from '../guides'
import { useRuntime } from '../runtime'

const { state, geo, ui } = useRuntime()

const mode = computed(() => state.value.inspect.mode)
const sel = computed(() => state.value.inspect.selection.kind)
const refMode = computed(() => mode.value.kind === 'reference')
const picking = computed(() => mode.value.kind === 'pick' || mode.value.kind === 'reference' || mode.value.kind === 'anchor')

/** The hovered element: while picking (unless it is the selection itself) and in every mode while measuring. */
const cand = computed<Rect | null>(() => {
  const c = geo.value.candidate
  // While an issue is being composed the hover target is not what the person is looking at.
  if (!(picking.value || state.value.measuring) || !c || state.value.composing) return null
  const a = geo.value.a
  const same = a && c.rect.x === a.x && c.rect.y === a.y && c.rect.width === a.width && c.rect.height === a.height
  if (same && !state.value.measuring) return null
  return c.rect
})

const candLabel = computed(() => {
  const c = geo.value.candidate
  if (!cand.value || !c) return null
  // In reference mode the B tag sits on the corner; the label starts after it.
  // Near the right edge the label ends at the candidate's right edge instead of running off-screen.
  const end = c.rect.x > ui.viewport.width - 280
  return { x: end ? c.rect.x + c.rect.width : c.rect.x + (refMode.value ? 12 : 0), y: c.rect.y, end, text: `${c.chip}  ${px(c.rect.width)} x ${px(c.rect.height)}` }
})

const sizeLabel = computed(() => {
  const a = geo.value.a
  // The hovered element carries its own size label; A is labelled while nothing is hovered.
  if (!a || !state.value.measuring || refMode.value || cand.value) return null
  return { x: a.x + a.width / 2, y: a.y + a.height, text: `${px(a.width)} x ${px(a.height)}` }
})

const drawing = computed<Drawing>(() => {
  const a = geo.value.a
  const m = mode.value
  if (m.kind === 'reference' && cand.value) {
    if (!a) return merge()
    if (m.preset === 'match-height') return extents(a, cand.value, 'height')
    if (m.preset === 'match-width') return extents(a, cand.value, 'width')
    if (m.preset === 'align' && m.params.edge) return edgeGuide(a, cand.value, m.params.edge)
    return pairwise(a, cand.value)
  }
  if (!state.value.measuring || !cand.value) return merge()
  const c = geo.value.candidate!
  const h = c.rect
  const own = c.box ? boxGuides(h, c.box) : merge()
  if (!a) return own
  if (c.relation === 'self') return own
  if (c.relation === 'inside') return merge(own, inset(h, a))
  if (c.relation === 'contains') return inset(a, h)
  return pairwise(a, h)
})

function box(r: Rect) {
  return { x: r.x, y: r.y, width: Math.max(r.width, 0), height: Math.max(r.height, 0) }
}

function brackets(r: Rect): string {
  const s = Math.min(8, r.width / 3, r.height / 3)
  const x2 = r.x + r.width
  const y2 = r.y + r.height
  return [
    `M${r.x} ${r.y + s}V${r.y}H${r.x + s}`,
    `M${x2 - s} ${r.y}H${x2}V${r.y + s}`,
    `M${x2} ${y2 - s}V${y2}H${x2 - s}`,
    `M${r.x + s} ${y2}H${r.x}V${y2 - s}`,
  ].join('')
}

function clampX(x: number) {
  return Math.max(4, Math.min(x, ui.viewport.width - 4))
}

function clampY(y: number) {
  return Math.max(4, Math.min(y, ui.viewport.height - 4))
}

function at(x: number, y: number, where: 'above' | 'below' | 'center') {
  const tx = where === 'above' ? '0' : '-50%'
  const ty = where === 'above' ? 'calc(-100% - 4px)' : where === 'below' ? '4px' : '-50%'
  return { left: `${clampX(x)}px`, top: `${clampY(y)}px`, transform: `translate(${tx}, ${ty})` }
}

function atEnd(x: number, y: number) {
  return { left: `${clampX(x)}px`, top: `${clampY(y)}px`, transform: 'translate(-100%, calc(-100% - 4px))' }
}

function corner(r: Rect) {
  return { left: `${clampX(r.x - 8)}px`, top: `${clampY(r.y - 8)}px`, transform: 'translate(-50%, -50%)' }
}
</script>
