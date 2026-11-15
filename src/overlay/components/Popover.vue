<!-- src/overlay/components/Popover.vue -->
<template>
  <div
    ref="panel"
    class="float pop"
    role="menu"
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
import { useRuntime, useSurface } from '../runtime'

const props = withDefaults(defineProps<{
  anchor: Box | null
  opener?: HTMLElement | null
  label: string
  order?: Side[]
}>(), { opener: null, order: () => ['above', 'below', 'right', 'left'] })

const emit = defineEmits<{ close: [] }>()
const { engine } = useRuntime()
/** The window the menu is in: outside clicks and room are counted there. */
const surface = useSurface()
const doc = surface.doc
const panel = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
const placed = ref(false)

function reposition() {
  if (!panel.value || !props.anchor) return
  const { width, height } = panel.value.getBoundingClientRect()
  const size = { width, height }
  const box = place(props.anchor, size, surface.viewport, props.order, 6)
  pos.value = { x: box.x, y: box.y }
  placed.value = true
}

function items(): HTMLElement[] {
  return [...(panel.value?.querySelectorAll<HTMLElement>('.item:not(:disabled)') ?? [])]
}

function onKey(event: KeyboardEvent) {
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
  items()[0]?.focus()
})

watch(() => [props.anchor, surface.viewport.width, surface.viewport.height], () => nextTick(reposition))

onBeforeUnmount(() => {
  release()
  doc.removeEventListener('pointerdown', onOutside, true)
  const root = panel.value?.getRootNode() as ShadowRoot | undefined
  const active = root?.activeElement
  if (props.opener && (!active || panel.value?.contains(active))) props.opener.focus()
})

</script>
