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
      v-for="(member, i) in geo.members"
      :key="`m${i}`"
      class="box member"
      :class="{ 'member-on': ui.member === i }"
      v-bind="box(member)"
    />
    <rect
      v-if="geo.a"
      class="box a-halo"
      v-bind="box(geo.a)"
    />
    <rect
      v-if="geo.a"
      class="box a"
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
      class="box region draft"
      :class="ui.regionMode"
      v-bind="box(geo.region)"
    />
    <rect
      v-if="pulse"
      :key="(ui.checking ?? ui.pointed)?.until"
      class="box pulse"
      v-bind="box(pulse)"
    />
    <rect
      v-if="cand"
      class="box cand"
      v-bind="box(cand)"
    />
    <!-- While measuring, the space under the pointer, which a click picks. -->
    <rect
      v-if="hoveredSpace"
      class="box space"
      v-bind="box(hoveredSpace.rect)"
    />
    <rect
      v-for="(area, i) in drawing.boxes"
      :key="`o${i}`"
      class="box"
      :class="area.kind === 'over' ? 'dist over' : area.kind"
      v-bind="box(area.rect)"
    />
    <line
      v-for="(line, i) in drawing.lines"
      :key="`l${i}`"
      :class="lineClass(line)"
      :x1="line.x1"
      :y1="line.y1"
      :x2="line.x2"
      :y2="line.y2"
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
  <!-- Which elements the region being drawn will select, at its top-left corner. -->
  <div
    v-if="geo.region && ui.regionMode"
    class="measure-label region-mode"
    :class="ui.regionMode"
    :style="cornerLabel(geo.region)"
  >
    {{ t(ui.regionMode === 'inside' ? 'inspector.regionInside' : 'inspector.regionTouching') }}
  </div>
  <div
    v-for="(label, i) in drawing.labels"
    :key="`t${i}`"
    class="measure-label"
    :class="label.kind"
    :style="at(label.x, label.y, 'center')"
  >
    {{ label.text }}
  </div>
  <template v-if="(refMode || state.composing?.bBounds) && geo.a">
    <span
      class="letter a"
      :style="corner(geo.a)"
    >A</span>
    <span
      v-if="bMark"
      class="letter b"
      :style="corner(bMark)"
    >B</span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { px } from '../../core/geometry'
import type { Rect } from '../../core/model'
import { boxGuides, edgeGuide, extents, inset, merge, pairwise, type Drawing, type Line } from '../guides'
import { useRuntime } from '../runtime'

const { engine, state, geo, ui, t } = useRuntime()

const mode = computed(() => state.value.inspect.mode)
const sel = computed(() => state.value.inspect.selection.kind)
const refMode = computed(() => mode.value.kind === 'reference')
/**
 * The target of the issue the agent is checking, or of the one Show on page pointed at; followed as the page
 * scrolls (`geo` changes with it).
 */
const pulse = computed<Rect | null>(() => {
  const shown = ui.checking ?? ui.pointed
  return shown && geo.value ? engine.targetRect(shown.issue) : null
})
const picking = computed(() => mode.value.kind === 'pick'
  || mode.value.kind === 'reference'
  || mode.value.kind === 'anchor')

/**
 * The hovered element: while picking (unless it is the selection itself) and in every mode while
 * measuring.
 */
const cand = computed<Rect | null>(() => {
  const candidate = geo.value.candidate
  // While an issue is being composed the hover target is not what the person is looking at.
  if (!(picking.value || state.value.measuring) || !candidate || state.value.composing) return null
  const a = geo.value.a
  const same = a && candidate.rect.x === a.x && candidate.rect.y === a.y
    && candidate.rect.width === a.width && candidate.rect.height === a.height
  if (same && !state.value.measuring) return null
  return candidate.rect
})

/** Where the B tag sits: on the hovered element, else on the B already chosen. */
const bMark = computed(() => cand.value ?? state.value.composing?.bBounds ?? null)

/** The space under the pointer while picking with measurements on: a click on it picks that space. */
const hoveredSpace = computed(() => {
  const space = geo.value.candidate?.space
  return cand.value && picking.value && state.value.measuring && space ? space : null
})

const candLabel = computed(() => {
  const candidate = geo.value.candidate
  if (!cand.value || !candidate) return null
  const space = hoveredSpace.value
  if (space) {
    const text = `${space.name} ${px(space.size)}`
    return { x: space.rect.x, y: space.rect.y, end: space.rect.x > ui.viewport.width - 200, text }
  }
  // In reference mode the B tag sits on the corner; the label starts after it.
  const start = candidate.rect.x + (refMode.value ? 12 : 0)
  // Near the right edge the label ends at the candidate's right edge instead of running off-screen.
  const end = candidate.rect.x > ui.viewport.width - 280
  return {
    x: end ? candidate.rect.x + candidate.rect.width : start,
    y: candidate.rect.y,
    end,
    text: `${candidate.chip}  ${px(candidate.rect.width)} x ${px(candidate.rect.height)}`,
  }
})

const sizeLabel = computed(() => {
  const a = geo.value.a
  // The hovered element carries its own size label; A is labelled while nothing is hovered.
  if (!a || !state.value.measuring || refMode.value || cand.value) return null
  return { x: a.x + a.width / 2, y: a.y + a.height, text: `${px(a.width)} x ${px(a.height)}` }
})

const drawing = computed<Drawing>(() => {
  const a = geo.value.a
  const inspectMode = mode.value
  if (inspectMode.kind === 'reference' && cand.value) {
    if (!a) return merge()
    if (inspectMode.preset === 'match-height') return extents(a, cand.value, 'height')
    if (inspectMode.preset === 'match-width') return extents(a, cand.value, 'width')
    if (inspectMode.preset === 'align' && inspectMode.params.edge) {
      return edgeGuide(a, cand.value, inspectMode.params.edge)
    }
    return pairwise(a, cand.value)
  }
  const candidate = geo.value.candidate
  if (!state.value.measuring || !cand.value || !candidate) return merge()
  const hovered = candidate.rect
  const own = candidate.box ? boxGuides(hovered, candidate.box) : merge()
  if (!a) return own
  if (candidate.relation === 'self') return own
  if (candidate.relation === 'inside') return merge(own, inset(hovered, a))
  if (candidate.relation === 'contains') return inset(a, hovered)
  return pairwise(a, hovered)
})

/** A guide line's classes by its kind; an overlap is also a distance. */
function lineClass(line: Line): string {
  if (line.kind === 'tick') return 'tick'
  if (line.kind === 'edge') return 'edge'
  if (line.kind === 'over') return 'dist over'
  return 'dist'
}

function box(rect: Rect) {
  return { x: rect.x, y: rect.y, width: Math.max(rect.width, 0), height: Math.max(rect.height, 0) }
}

function brackets(rect: Rect): string {
  const arm = Math.min(8, rect.width / 3, rect.height / 3)
  const x2 = rect.x + rect.width
  const y2 = rect.y + rect.height
  return [
    `M${rect.x} ${rect.y + arm}V${rect.y}H${rect.x + arm}`,
    `M${x2 - arm} ${rect.y}H${x2}V${rect.y + arm}`,
    `M${x2} ${y2 - arm}V${y2}H${x2 - arm}`,
    `M${rect.x + arm} ${y2}H${rect.x}V${y2 - arm}`,
  ].join('')
}

function clampX(x: number) {
  return Math.max(4, Math.min(x, ui.viewport.width - 4))
}

function clampY(y: number) {
  return Math.max(4, Math.min(y, ui.viewport.height - 4))
}

/** A label's vertical shift from its point, by where it sits. */
const SHIFT_Y = { above: 'calc(-100% - 4px)', below: '4px', center: '-50%' } as const

function at(x: number, y: number, where: 'above' | 'below' | 'center') {
  const tx = where === 'above' ? '0' : '-50%'
  const ty = SHIFT_Y[where]
  return { left: `${clampX(x)}px`, top: `${clampY(y)}px`, transform: `translate(${tx}, ${ty})` }
}

/** Above a region's top-left corner, or just inside it when there is no room above. */
function cornerLabel(rect: Rect) {
  const room = rect.y >= 24
  return {
    left: `${clampX(rect.x)}px`,
    top: `${clampY(room ? rect.y : rect.y + 4)}px`,
    transform: room ? 'translate(0, calc(-100% - 4px))' : 'none',
  }
}

function atEnd(x: number, y: number) {
  return { left: `${clampX(x)}px`, top: `${clampY(y)}px`, transform: 'translate(-100%, calc(-100% - 4px))' }
}

function corner(rect: Rect) {
  return {
    left: `${clampX(rect.x - 8)}px`,
    top: `${clampY(rect.y - 8)}px`,
    transform: 'translate(-50%, -50%)',
  }
}
</script>
