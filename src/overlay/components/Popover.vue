<!-- src/overlay/components/Popover.vue -->
<template>
  <div
    ref="panel"
    class="float"
    :class="kind"
    :role="role"
    :aria-label="label"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, visibility: placed ? 'visible' : 'hidden' }"
    @keydown="onKey"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { place, type Box, type Side } from '../place'
import { useRuntime } from '../runtime'

const props = withDefaults(defineProps<{
  anchor: Box | null
  opener?: HTMLElement | null
  role?: 'menu' | 'dialog'
  kind?: string
  label: string
  order?: Side[]
}>(), { opener: null, role: 'menu', kind: 'pop', order: () => ['above', 'below', 'right', 'left'] })

const emit = defineEmits<{ close: [] }>()
const { engine, ui, doc } = useRuntime()
const panel = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const placed = ref(false)

function reposition() {
  if (!panel.value || !props.anchor) return
  const { width, height } = panel.value.getBoundingClientRect()
  const size = { width, height }
  const box = place(props.anchor, size, ui.viewport, props.order, [], 6)
  pos.value = { x: box.x, y: box.y }
  placed.value = true
}

function items(): HTMLElement[] {
  return [...(panel.value?.querySelectorAll<HTMLElement>('.item:not(:disabled), [data-focus]') ?? [])]
}

function onKey(event: KeyboardEvent) {
  if (props.role !== 'menu') return
  const list = items()
  const at = list.indexOf(event.target as HTMLElement)
  let next: number
  if (event.key === 'ArrowDown') next = (at + 1) % list.length
  else if (event.key === 'ArrowUp') next = (at - 1 + list.length) % list.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else return
  event.preventDefault()
  list[next]?.focus()
}

function onOutside(event: Event) {
  const path = event.composedPath()
  if (panel.value && path.includes(panel.value)) return
  if (props.opener && path.includes(props.opener)) return
  emit('close')
}

const release = engine.pushLayer(() => emit('close'))

onMounted(async () => {
  doc.addEventListener('pointerdown', onOutside, true)
  await nextTick()
  reposition()
  // Hidden until placed; focus only lands once the placed state has rendered.
  await nextTick()
  const first = panel.value?.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0]
  first?.focus()
})

watch(() => [props.anchor, ui.viewport], () => nextTick(reposition))

onBeforeUnmount(() => {
  release()
  doc.removeEventListener('pointerdown', onOutside, true)
  const root = panel.value?.getRootNode() as ShadowRoot | undefined
  const active = root?.activeElement
  if (props.opener && (!active || panel.value?.contains(active))) props.opener.focus()
})

defineExpose({ reposition })
</script>
