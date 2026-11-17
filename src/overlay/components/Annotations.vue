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
      v-for="item in items"
      :key="item.id"
    >
      <rect
        class="box mark"
        :class="{ on: item.active }"
        :x="item.rect.x"
        :y="item.rect.y"
        :width="Math.max(item.rect.width, 0)"
        :height="Math.max(item.rect.height, 0)"
      />
      <template v-if="item.b">
        <rect
          class="box b mark-b"
          :class="{ on: item.active }"
          :x="item.b.x"
          :y="item.b.y"
          :width="item.b.width"
          :height="item.b.height"
        />
        <line
          class="tie"
          :class="{ on: item.active }"
          :x1="item.rect.x + item.rect.width / 2"
          :y1="item.rect.y + item.rect.height / 2"
          :x2="item.b.x + item.b.width / 2"
          :y2="item.b.y + item.b.height / 2"
        />
      </template>
    </template>
  </svg>
  <template
    v-for="item in items"
    :key="`p${item.id}`"
  >
    <div
      class="plate"
      :class="{ on: item.active }"
      :style="{ left: `${item.x}px`, top: `${item.y}px`, transform: `translate(${item.dx}px, ${item.dy}px)` }"
      :data-id="item.id"
      @pointerenter="ui.hover = item.id"
      @pointerleave="ui.hover = null"
    >
      <button
        type="button"
        class="plate-main"
        :aria-label="`${t('card.title', { number: item.seq })}: ${item.text}`"
        @click="shows(item.id) ? closeIssue(ui) : openIssue(ui, item.id)"
      >
        <span class="num">{{ item.seq }}</span>
        <Icon :name="item.icon" />
        <span class="what">{{ item.title }}</span>
        <span
          v-if="item.note"
          class="said"
        >{{ item.note }}</span>
      </button>
      <button
        type="button"
        class="plate-x"
        :aria-label="t('card.dismiss', { number: item.seq })"
        @click="remove(item.id)"
        @pointerenter="showTip(ui, $event.currentTarget as Element, t('card.dismiss', { number: item.seq }))"
        @pointerleave="hideTip(ui, t('card.dismiss', { number: item.seq }))"
        @focus="showTip(ui, $event.currentTarget as Element, t('card.dismiss', { number: item.seq }))"
        @blur="hideTip(ui, t('card.dismiss', { number: item.seq }))"
      >
        <Icon name="close" />
      </button>
    </div>
    <span
      v-if="item.b"
      class="letter b"
      :style="{ left: `${item.b.x - 8}px`, top: `${item.b.y - 8}px`, transform: 'translate(-50%, -50%)' }"
    >B</span>
  </template>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Rect } from '../../core/model'
import { describe, issueTitle, subjectOf } from '../labels'
import { closeIssue, openIssue } from '../navigate'
import { hideTip, showTip } from '../tip'
import { useRuntime } from '../runtime'
import Icon from './Icon.vue'

const { engine, state, geo, settings, ui, t, doc } = useRuntime()
const win = doc.defaultView

const PLATE_H = 26
/** Plates within this distance of the pointer slide away, like magnets of the same polarity. */
const REPEL_RADIUS = 110
const REPEL_MAX = 56

/**
 * `over` is the plate the browser hit-tested under the pointer; that plate stays put so it can be
 * clicked.
 */
const cursor = ref<{ x: number, y: number, over: string | null } | null>(null)
/**
 * Escape direction per plate (-1 up, 1 down), fixed while the pointer stays near, so a chased plate does
 * not flip sides.
 */
const escapes = new Map<string, number>()
/** Where each plate was pushed last. */
const last = new Map<string, { dx: number, dy: number }>()
let frame = 0
let next: { x: number, y: number, over: string | null } | null = null

function onMove(event: PointerEvent) {
  const plate = event.composedPath().find(
    target => (target as Element).classList?.contains('plate'),
  ) as HTMLElement | undefined
  next = { x: event.clientX, y: event.clientY, over: plate?.dataset.id ?? null }
  if (frame || !win) return
  frame = win.requestAnimationFrame(() => {
    frame = 0
    cursor.value = next
  })
}

function onLeave() {
  cursor.value = null
}

onMounted(() => {
  win?.addEventListener('pointermove', onMove, { passive: true, capture: true })
  doc.documentElement.addEventListener('pointerleave', onLeave)
})

onBeforeUnmount(() => {
  win?.removeEventListener('pointermove', onMove, { capture: true })
  doc.documentElement.removeEventListener('pointerleave', onLeave)
  if (frame) win?.cancelAnimationFrame(frame)
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

/**
 * Vertical push away from the pointer, capped; a wide plate moved up or down uncovers its target and stays
 * under the pointer's x.
 */
function repel(x: number, y: number, width: number, height: number, id: string): { dx: number, dy: number } {
  const pointer = settings.dodge ? cursor.value : null
  if (pointer?.over === id) return last.get(id) ?? { dx: 0, dy: 0 }
  if (!pointer) {
    escapes.delete(id)
    last.delete(id)
    return { dx: 0, dy: 0 }
  }
  const nx = Math.max(x, Math.min(pointer.x, x + width))
  const ny = Math.max(y, Math.min(pointer.y, y + height))
  const distance = Math.hypot(pointer.x - nx, pointer.y - ny)
  if (distance >= REPEL_RADIUS) {
    escapes.delete(id)
    last.delete(id)
    return { dx: 0, dy: 0 }
  }
  const above = y - 4
  const below = ui.viewport.height - height - 4 - y
  let dir = escapes.get(id)
  if (!dir) {
    dir = pointer.y > y + height / 2 ? -1 : 1
    if ((dir < 0 ? above : below) < REPEL_MAX
      && (dir < 0 ? below : above) > (dir < 0 ? above : below)) dir = -dir
    escapes.set(id, dir)
  }
  const push = Math.min(REPEL_MAX, (REPEL_RADIUS - distance) * 0.6)
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
  icon: string
  title: string
  text: string
  note: string
  active: boolean
  x: number
  y: number
  dx: number
  dy: number
}

/** Plates sit just above their target, and are pushed down when they would cover each other. */
const items = computed<Item[]>(() => {
  const issues = new Map(state.value.drafts.issues.map(issue => [issue.id, issue]))
  const out: Item[] = []
  const taken: Rect[] = []
  const placed = geo.value.pins.flatMap(pin => pin.rect ? [{ pin, rect: pin.rect }] : [])
    .sort((first, second) => (first.rect.y - second.rect.y) || (first.rect.x - second.rect.x))
  for (const { pin, rect } of placed) {
    const issue = issues.get(pin.id)
    if (!issue) continue
    if (rect.y + rect.height < 0 || rect.y > ui.viewport.height
      || rect.x + rect.width < 0 || rect.x > ui.viewport.width) continue
    const title = issueTitle(issue, engine.registry, t)
    const note = issue.intent.note.replace(/\s+/g, ' ').trim()
    const shortNote = note.length > 60 ? `${note.slice(0, 57)}...` : note
    const height = PLATE_H + (shortNote ? NOTE_H : 0)
    const width = Math.min(MAX_W, 70 + Math.max(title.length, shortNote.length * 0.9) * 6.6)
    let x = Math.max(4, Math.min(rect.x, ui.viewport.width - width - 4))
    let y = rect.y - height - 4 < 4 ? rect.y + 4 : rect.y - height - 4
    for (let guard = 0; guard < 20; guard++) {
      const hit = taken.find(other => x < other.x + other.width && other.x < x + width
        && y < other.y + other.height && other.y < y + height)
      if (!hit) break
      y = hit.y + hit.height + 2
    }
    y = Math.min(y, ui.viewport.height - height - 4)
    taken.push({ x, y, width, height })
    out.push({
      id: issue.id,
      seq: issue.seq,
      rect,
      b: pin.b,
      icon: engine.registry.byId.get(issue.intent.preset.id)?.icon ?? 'note',
      title,
      text: describe(subjectOf(issue, t), engine.registry, t),
      note: shortNote,
      active: ui.hover === issue.id || shows(issue.id),
      x,
      y,
      ...repel(x, y, width, height, issue.id),
    })
  }
  return out
})
</script>
