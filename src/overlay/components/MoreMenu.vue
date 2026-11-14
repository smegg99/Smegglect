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
    <div class="sep" />
    <div class="head">
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
    <div class="sep" />
    <div class="head">
      {{ t('inspector.title') }}
    </div>
    <button
      v-for="s in sides"
      :key="s.value"
      type="button"
      class="item"
      role="menuitemradio"
      :aria-checked="settings.side === s.value"
      @click="settings.side = s.value"
    >
      <Icon :name="s.icon" />{{ t(s.label) }}
    </button>
    <div class="sep" />
    <div class="head">
      {{ t('dock.display') }}
    </div>
    <button
      type="button"
      class="item"
      role="menuitemcheckbox"
      :aria-checked="settings.labels"
      @click="settings.labels = !settings.labels"
    >
      <Icon name="labels" />{{ t('dock.labels') }}<Icon
        v-if="settings.labels"
        name="check"
        class="hint"
      />
    </button>
    <button
      type="button"
      class="item"
      role="menuitemcheckbox"
      :aria-checked="settings.large"
      @click="settings.large = !settings.large"
    >
      <Icon name="large" />{{ t('dock.large') }}<Icon
        v-if="settings.large"
        name="check"
        class="hint"
      />
    </button>
    <div class="sep" />
    <div class="head">
      {{ t('dock.theme') }}
    </div>
    <button
      v-for="th in themes"
      :key="th.value"
      type="button"
      class="item"
      role="menuitemradio"
      :aria-checked="settings.theme === th.value"
      @click="settings.theme = th.value"
    >
      <Icon name="theme" />{{ t(th.label) }}
    </button>
  </Popover>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Placement, Settings } from '../context'
import type { Box, Side } from '../place'
import { useRuntime } from '../runtime'
import Icon from './Icon.vue'
import Popover from './Popover.vue'

const props = defineProps<{ anchor: Box | null, opener: HTMLElement | null, side: Side }>()
const emit = defineEmits<{ close: [] }>()
const { engine, settings, t } = useRuntime()

const order = computed<Side[]>(() => [props.side, 'above', 'below', 'left', 'right'])

const placements: { value: Placement, icon: string, label: string }[] = [
  { value: 'bottom', icon: 'dockBottom', label: 'dock.placeBottom' },
  { value: 'top', icon: 'dockTop', label: 'dock.placeTop' },
  { value: 'left', icon: 'dockLeft', label: 'dock.placeLeft' },
  { value: 'right', icon: 'dockRight', label: 'dock.placeRight' },
]

const sides: { value: Settings['side'], icon: string, label: string }[] = [
  { value: 'left', icon: 'dockLeft', label: 'inspector.onLeft' },
  { value: 'right', icon: 'dockRight', label: 'inspector.onRight' },
]

const themes: { value: Settings['theme'], label: string }[] = [
  { value: 'auto', label: 'dock.themeAuto' },
  { value: 'light', label: 'dock.themeLight' },
  { value: 'dark', label: 'dock.themeDark' },
]

function collapse() {
  emit('close')
  engine.setExpanded(false)
}
</script>
