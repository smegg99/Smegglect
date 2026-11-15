<!-- src/overlay/components/SettingsTab.vue -->
<!-- The overlay's settings on Vuetify and S99AB, remembered per project; a mount option fixes its setting. -->
<template>
  <!-- S99AB's settings layout: a section title over a hairline, then rows of a label and a control. -->
  <div
    id="sg-tabpanel"
    class="body settings"
    role="tabpanel"
    aria-labelledby="sg-tab-settings"
  >
    <section class="form-section">
      <h3 class="form-section__title">
        {{ t('settings.appearance') }}
      </h3>
      <div
        v-for="row in choiceRows"
        :key="row.name"
        class="form-row"
      >
        <span class="form-row__text">
          <span class="form-row__label">{{ row.title }}</span>
          <span
            v-if="fixed.has(row.name)"
            class="form-row__desc"
          >{{ t('settings.fixed') }}</span>
        </span>
        <ToolGroup
          :items="row.choices"
          :model-value="row.current"
          :label="row.title"
          :disabled="fixed.has(row.name)"
          @update:model-value="row.pick"
        />
      </div>
      <div class="form-row">
        <span class="form-row__text">
          <span class="form-row__label">{{ t('settings.accent') }}</span>
        </span>
        <div
          class="swatches"
          role="radiogroup"
          :aria-label="t('settings.accent')"
        >
          <VBtn
            v-for="swatch in SWATCHES"
            :key="swatch"
            role="radio"
            class="swatch"
            :class="{ theme: !swatch }"
            icon
            size="small"
            :variant="swatch ? 'flat' : 'outlined'"
            :color="swatch || undefined"
            :aria-checked="settings.accent === swatch"
            :aria-label="swatch || t('settings.accentTheme')"
            :title="swatch || t('settings.accentTheme')"
            :disabled="fixed.has('accent')"
            @click="settings.accent = swatch"
          >
            <VIcon
              v-if="settings.accent === swatch || !swatch"
              :icon="settings.accent === swatch ? mdiCheck : mdiPaletteOutline"
              size="16"
            />
          </VBtn>
        </div>
      </div>
    </section>
    <section
      v-for="group in switchGroups"
      :key="group.title"
      class="form-section"
    >
      <h3 class="form-section__title">
        {{ group.title }}
      </h3>
      <label
        v-for="item in group.switches"
        :key="item.name"
        class="form-row"
      >
        <span class="form-row__text">
          <span class="form-row__label">{{ item.label }}</span>
          <span
            v-if="fixed.has(item.name) || item.hint"
            class="form-row__desc"
          >{{ fixed.has(item.name) ? t('settings.fixed') : item.hint }}</span>
        </span>
        <VSwitch
          :model-value="settings[item.name]"
          :disabled="fixed.has(item.name)"
          :aria-label="item.label"
          hide-details
          density="compact"
          @update:model-value="value => (settings[item.name] = !!value)"
        />
      </label>
    </section>
    <section class="form-section">
      <h3 class="form-section__title">
        {{ t('settings.data') }}
      </h3>
      <div class="form-row">
        <span class="form-row__text">
          <span class="form-row__desc">{{ storedWhere }}</span>
        </span>
        <VBtn
          v-if="!asking"
          variant="tonal"
          size="small"
          @click="asking = true"
        >
          {{ t('settings.clear') }}
        </VBtn>
      </div>
      <div
        v-if="asking"
        class="form-row confirm"
        role="group"
        :aria-label="t('settings.clear')"
      >
        <span class="form-row__text">
          <span class="form-row__desc">{{ t('settings.clearAsk') }}</span>
        </span>
        <VBtn
          variant="text"
          size="small"
          @click="asking = false"
        >
          {{ t('settings.clearNo') }}
        </VBtn>
        <VBtn
          color="error"
          size="small"
          @click="clear"
        >
          {{ t('settings.clearYes') }}
        </VBtn>
      </div>
    </section>
    <section class="form-section">
      <h3 class="form-section__title">
        {{ t('settings.about') }}
      </h3>
      <!-- The logo over the facts. -->
      <div class="about-body">
        <Logo
          class="about-logo"
          label="Smegglect"
        />
        <dl class="about">
          <dt>{{ t('settings.version') }}</dt>
          <dd>{{ VERSION }}</dd>
          <dt>{{ t('settings.bridge') }}</dt>
          <dd>{{ bridgeText }}</dd>
          <template v-if="engine.bridge">
            <dt>{{ t('settings.root') }}</dt>
            <dd>{{ ui.bridgeHealth?.root || t('settings.rootUnknown') }}</dd>
          </template>
        </dl>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { mdiCheck, mdiPaletteOutline, mdiThemeLightDark, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js'
import { computed, inject, onMounted, ref } from 'vue'
import { VBtn } from 'vuetify/components/VBtn'
import { VIcon } from 'vuetify/components/VIcon'
import { VSwitch } from 'vuetify/components/VSwitch'
import { VERSION } from '../../core/version'
import { FIXED } from '../context'
import { say } from '../exporting'
import { useRuntime } from '../runtime'
import Logo from './Logo.vue'
import ToolGroup from './ToolGroup.vue'
import type { Language, Settings } from '../settings'

const rt = useRuntime()
const { engine, settings, sess, ui, t } = rt
const fixed = inject(FIXED, new Set<keyof Settings>())

/** The theme's own colour first, then a few that read well on both themes. */
const SWATCHES = ['', '#e85d51', '#d97757', '#e0a400', '#22a06b', '#3b82f6', '#8b5cf6'] as const

type Switch = keyof Pick<Settings, 'labels' | 'large' | 'steadySize' | 'motion' | 'shortcuts' | 'dodge'
  | 'watchOnly' | 'agentStatus'>

const choiceRows = computed(() => [
  {
    name: 'language' as const,
    title: t('settings.language'),
    current: settings.language,
    // Each language is named in itself, so it can be found whatever the overlay speaks.
    choices: [
      { value: 'auto', label: t('settings.auto') },
      { value: 'en', label: 'English' },
      { value: 'pl', label: 'Polski' },
    ],
    pick: (value: string) => (settings.language = value as Language),
  },
  {
    name: 'theme' as const,
    title: t('settings.theme'),
    current: settings.theme,
    // Icons, each named in its tooltip: follow the page, light, dark.
    choices: [
      { value: 'auto', label: t('settings.themeAuto'), icon: mdiThemeLightDark },
      { value: 'light', label: t('settings.light'), icon: mdiWhiteBalanceSunny },
      { value: 'dark', label: t('settings.dark'), icon: mdiWeatherNight },
    ],
    pick: (value: string) => (settings.theme = value as Settings['theme']),
  },
])

interface SwitchRow {
  name: Switch
  label: string
  hint?: string
}

const switchGroups = computed<{ title: string, switches: SwitchRow[] }[]>(() => [
  {
    title: t('settings.toolbar'),
    switches: [
      { name: 'labels', label: t('settings.labels') },
      { name: 'large', label: t('settings.large') },
      { name: 'steadySize', label: t('settings.steadySize') },
      { name: 'motion', label: t('settings.motion') },
      { name: 'shortcuts', label: t('settings.shortcuts') },
    ],
  },
  {
    title: t('settings.page'),
    switches: [{ name: 'dodge', label: t('settings.dodge'), hint: t('settings.dodgeNote') }],
  },
  {
    title: t('settings.agent'),
    switches: [
      { name: 'agentStatus', label: t('settings.agentStatus') },
      { name: 'watchOnly', label: t('settings.watchOnly'), hint: t('settings.watchOnlyNote') },
    ],
  },
])

const inMemory = computed(() => sess.value.status.kind === 'memory')
const storedWhere = computed(() => inMemory.value ? t('settings.dataMemory') : t('settings.dataBrowser'))
const asking = ref(false)

async function clear() {
  asking.value = false
  await engine.session.clearStored()
  say(rt, t('settings.cleared'))
}

const bridgeText = computed(() => {
  const bridge = engine.bridge
  if (!bridge) return t('settings.bridgeNone')
  if (bridge.label) return t('settings.bridgeThrough', { name: bridge.label })
  return bridge.url ?? ''
})

// The folder comes from the bridge itself.
onMounted(async () => {
  if (!engine.bridge || ui.bridgeHealth) return
  ui.bridgeHealth = await engine.bridge.health()
})
</script>
