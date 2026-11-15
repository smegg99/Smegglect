<!-- src/overlay/components/MoreMenu.vue -->
<template>
  <Popover
    :anchor="anchor"
    :opener="opener"
    :label="t('dock.more')"
    :order="order"
    @close="emit('close')"
  >
    <button
      type="button"
      class="item"
      role="menuitem"
      @click="collapse"
    >
      <Icon name="collapse" />{{ t('dock.collapse') }}
    </button>
    <button
      v-if="surface.window"
      type="button"
      class="item"
      role="menuitem"
      @click="back"
    >
      <Icon name="putBack" />{{ t('popout.back') }}
    </button>
    <button
      v-else-if="canPopOut"
      type="button"
      class="item"
      role="menuitem"
      @click="pop"
    >
      <Icon name="popOut" />{{ t('popout.open') }}
    </button>
    <!-- The button's edge is a page matter; the pop-out has no button. -->
    <template v-if="!surface.window">
      <div
        class="sep"
        role="separator"
      />
      <div
        role="group"
        :aria-label="t('dock.placement')"
      >
        <div
          class="head"
          aria-hidden="true"
        >
          {{ t('dock.placement') }}
        </div>
        <button
          v-for="p in placements"
          :key="p.value"
          type="button"
          class="item"
          role="menuitemradio"
          :aria-checked="settings.placement === p.value"
          @click="settings.placement = p.value"
        >
          <Icon :name="p.icon" />{{ t(p.label) }}
        </button>
      </div>
    </template>
  </Popover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Placement } from '../context'
import type { Box, Side } from '../place'
import { useRuntime, useSurface } from '../runtime'
import Icon from './Icon.vue'
import Popover from './Popover.vue'

const props = defineProps<{ anchor: Box | null, opener: HTMLElement | null, side: Side }>()
const emit = defineEmits<{ close: [] }>()
const { engine, settings, t, canPopOut, popOut, putBack } = useRuntime()
const surface = useSurface()

const order = computed<Side[]>(() => [props.side, 'above', 'below', 'left', 'right'])

const placements: { value: Placement, icon: string, label: string }[] = [
  { value: 'bottom', icon: 'dockBottom', label: 'dock.placeBottom' },
  { value: 'top', icon: 'dockTop', label: 'dock.placeTop' },
  { value: 'left', icon: 'dockLeft', label: 'dock.placeLeft' },
  { value: 'right', icon: 'dockRight', label: 'dock.placeRight' },
]



function collapse() {
  emit('close')
  engine.setExpanded(false)
}

function pop() {
  emit('close')
  popOut()
}

function back() {
  emit('close')
  putBack()
}
</script>
