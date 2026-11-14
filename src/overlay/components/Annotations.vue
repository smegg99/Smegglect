<!-- src/overlay/components/Annotations.vue -->
<template>
  <svg
    class="guides marks"
    aria-hidden="true"
    :viewBox="`0 0 ${ui.viewport.width} ${ui.viewport.height}`"
    preserveAspectRatio="none"
    :width="ui.viewport.width"
    :height="ui.viewport.height"
  >
    <template
      v-for="n in items"
      :key="n.id"
    >
      <rect
        class="box mark"
        :class="{ region: n.region, on: n.active }"
        :x="n.rect.x"
        :y="n.rect.y"
        :width="Math.max(n.rect.width, 0)"
        :height="Math.max(n.rect.height, 0)"
      />
      <template v-if="n.b">
        <rect
          class="box b mark-b"
          :class="{ on: n.active }"
          :x="n.b.x"
          :y="n.b.y"
          :width="n.b.width"
          :height="n.b.height"
        />
        <line
          class="tie"
          :class="{ on: n.active }"
          :x1="n.rect.x + n.rect.width / 2"
          :y1="n.rect.y + n.rect.height / 2"
          :x2="n.b.x + n.b.width / 2"
          :y2="n.b.y + n.b.height / 2"
        />
      </template>
    </template>
  </svg>
  <template
    v-for="n in items"
    :key="`p${n.id}`"
  >
    <div
      class="plate"
      :class="{ on: n.active, region: n.region, sent: !!n.state }"
      :style="{ left: `${n.x}px`, top: `${n.y}px`, transform: `translate(${n.dx}px, ${n.dy}px)` }"
      :data-id="n.id"
      @pointerenter="ui.hover = n.id"
      @pointerleave="ui.hover = null"
    >
      <button
        type="button"
        class="plate-main"
        :aria-label="`${t('card.title', { number: n.seq })}: ${n.text}`"
        @click="shows(n.id) ? closeIssue(ui) : openIssue(ui, n.id)"
      >
        <span class="num">{{ n.seq }}</span>
        <Icon :name="n.icon" />
        <span class="what">{{ n.title }}</span>
        <span
          v-if="n.state"
          class="state"
          :data-state="n.state"
        >{{ stateText({ t }, n.state) }}</span>
        <span
          v-if="n.note"
          class="said"
        >{{ n.note }}</span>
      </button>
      <button
        v-if="!n.state"
        type="button"
        class="plate-x"
        :aria-label="t('card.dismiss', { number: n.seq })"
        @click="remove(n.id)"
        @pointerenter="showTip(ui, $event.currentTarget as Element, t('card.dismiss', { number: n.seq }))"
        @pointerleave="hideTip(ui, t('card.dismiss', { number: n.seq }))"
        @focus="showTip(ui, $event.currentTarget as Element, t('card.dismiss', { number: n.seq }))"
        @blur="hideTip(ui, t('card.dismiss', { number: n.seq }))"
      >
        <Icon name="close" />
      </button>
    </div>
    <span
      v-if="n.b"
      class="letter b"
      :style="{ left: `${n.b.x - 8}px`, top: `${n.b.y - 8}px`, transform: 'translate(-50%, -50%)' }"
    >B</span>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Rect } from '../../core/model'
import { describe, issueTitle, subjectOf } from '../labels'
import type { IssueState } from '../../core/review'
import { closeIssue, openIssue } from '../navigate'
import { marked, stateText } from '../review'
import { hideTip, showTip } from '../tip'
import { useRuntime } from '../runtime'
import Icon from './Icon.vue'

const { engine, state, geo, sess, ui, t, doc } = useRuntime()

const PLATE_H = 26
/** Plates within this distance of the pointer slide away, like magnets of the same polarity. */
const REPEL_RADIUS = 110
const REPEL_MAX = 56

/** `over` is the plate the browser hit-tested under the pointer; that plate stays put so it can be clicked. */
const cursor = ref<{ x: number, y: number, over: string | null } | null>(null)
/** Escape direction per plate (-1 up, 1 down), fixed while the pointer stays near, so a chased plate does not flip sides. */
const escapes = new Map<string, number>()
/** Where each plate was pushed last. */
const last = new Map<string, { dx: number, dy: number }>()
let frame = 0
let next: { x: number, y: number, over: string | null } | null = null

function onMove(e: PointerEvent) {
  const plate = e.composedPath().find(n => (n as Element).classList?.contains('plate')) as HTMLElement | undefined
  next = { x: e.clientX, y: e.clientY, over: plate?.dataset.id ?? null }
  if (frame) return
  frame = doc.defaultView!.requestAnimationFrame(() => {
    frame = 0
    cursor.value = next
  })
}

function onLeave() {
  cursor.value = null
}

onMounted(() => {
  const win = doc.defaultView!
  win.addEventListener('pointermove', onMove, { passive: true, capture: true })
  doc.documentElement.addEventListener('pointerleave', onLeave)
})

onBeforeUnmount(() => {
  const win = doc.defaultView!
  win.removeEventListener('pointermove', onMove, { capture: true })
  doc.documentElement.removeEventListener('pointerleave', onLeave)
  if (frame) win.cancelAnimationFrame(frame)
})

/** The issue is open in the inspector right now. */
function shows(id: string): boolean {
  return ui.inspector && ui.view === 'issue' && ui.issue === id
}

function remove(id: string) {
  ui.hover = null
  ui.tip = null
  if (shows(id)) closeIssue(ui)
  engine.removeIssue(id)
}

/** Vertical push away from the pointer, capped; a wide plate moved up or down uncovers its target and stays under the pointer's x. */
function repel(x: number, y: number, w: number, h: number, id: string): { dx: number, dy: number } {
  const c = cursor.value
  if (c?.over === id) return last.get(id) ?? { dx: 0, dy: 0 }
  if (!c) {
    escapes.delete(id)
    last.delete(id)
    return { dx: 0, dy: 0 }
  }
  const nx = Math.max(x, Math.min(c.x, x + w))
  const ny = Math.max(y, Math.min(c.y, y + h))
  const d = Math.hypot(c.x - nx, c.y - ny)
  if (d >= REPEL_RADIUS) {
    escapes.delete(id)
    last.delete(id)
    return { dx: 0, dy: 0 }
  }
  const above = y - 4
  const below = ui.viewport.height - h - 4 - y
  let dir = escapes.get(id)
  if (!dir) {
    dir = c.y > y + h / 2 ? -1 : 1
    if ((dir < 0 ? above : below) < REPEL_MAX && (dir < 0 ? below : above) > (dir < 0 ? above : below)) dir = -dir
    escapes.set(id, dir)
  }
  const push = Math.min(REPEL_MAX, (REPEL_RADIUS - d) * 0.6)
  const dy = Math.max(-above, Math.min(dir * push, below))
  last.set(id, { dx: 0, dy })
  return { dx: 0, dy }
}
const NOTE_H = 16
const MAX_W = 260

interface Item {
  id: string
  seq: number
  rect: Rect
  b: Rect | null
  region: boolean
  icon: string
  title: string
  text: string
  note: string
  /** Sent issues only: where the review stands. */
  state: IssueState | null
  active: boolean
  x: number
  y: number
  dx: number
  dy: number
}

/** Plates sit just above their target, and are pushed down when they would cover each other. */
const items = computed<Item[]>(() => {
  const issues = new Map(state.value.drafts.issues.map(i => [i.id, i]))
  // A sent issue has no X (it is not a draft to drop) and says where its review stands.
  const sent = new Map(marked(sess.value).map(m => [m.issue.id, m]))
  for (const m of sent.values()) issues.set(m.issue.id, m.issue)
  const out: Item[] = []
  const taken: { x: number, y: number, w: number, h: number }[] = []
  const pins = geo.value.pins.filter(p => p.rect).sort((a, b) => (a.rect!.y - b.rect!.y) || (a.rect!.x - b.rect!.x))
  for (const pin of pins) {
    const issue = issues.get(pin.id)
    const rect = pin.rect!
    if (!issue) continue
    if (rect.y + rect.height < 0 || rect.y > ui.viewport.height || rect.x + rect.width < 0 || rect.x > ui.viewport.width) continue
    const title = issueTitle(issue, engine.registry, t)
    const note = issue.intent.note.replace(/\s+/g, ' ').trim()
    const shortNote = note.length > 60 ? `${note.slice(0, 57)}...` : note
    const h = PLATE_H + (shortNote ? NOTE_H : 0)
    const w = Math.min(MAX_W, 70 + Math.max(title.length, shortNote.length * 0.9) * 6.6)
    let x = Math.max(4, Math.min(rect.x, ui.viewport.width - w - 4))
    let y = rect.y - h - 4 < 4 ? rect.y + 4 : rect.y - h - 4
    for (let guard = 0; guard < 20; guard++) {
      const hit = taken.find(o => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h)
      if (!hit) break
      y = hit.y + hit.h + 2
    }
    y = Math.min(y, ui.viewport.height - h - 4)
    taken.push({ x, y, w, h })
    out.push({
      id: issue.id,
      seq: issue.seq,
      rect,
      b: pin.b,
      region: issue.operands.a.kind === 'region',
      icon: engine.registry.byId.get(issue.intent.preset.id)?.icon ?? 'note',
      title,
      text: describe(subjectOf(issue, t), engine.registry, t),
      note: shortNote,
      state: sent.get(issue.id)?.state ?? null,
      active: ui.hover === issue.id || shows(issue.id),
      x,
      y,
      ...repel(x, y, w, h, issue.id),
    })
  }
  return out
})
</script>
