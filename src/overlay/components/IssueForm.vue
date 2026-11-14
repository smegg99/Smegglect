<!-- src/overlay/components/IssueForm.vue -->
<template>
  <section
    ref="el"
    class="form"
    :aria-label="title"
    @keydown.enter.ctrl.prevent="add"
    @keydown.enter.meta.prevent="add"
  >
    <header class="form-head">
      <Icon :name="def?.icon ?? 'note'" />
      <h2>{{ title }}</h2>
    </header>
    <p class="says">
      {{ sentence }}
    </p>
    <div
      v-if="def?.choice"
      class="choices"
      role="radiogroup"
      :aria-label="t('compose.pick')"
    >
      <button
        v-for="o in def.choice.options"
        :key="o"
        type="button"
        class="chipkey"
        role="radio"
        :aria-checked="c.params[def.choice.key] === o"
        :data-autofocus="o === def.choice.options[0] ? '' : undefined"
        @click="engine.compose({ ...c.params, [def.choice!.key]: o })"
      >
        {{ choiceLabel(def, o, t) }}
      </button>
    </div>
    <template v-if="c.comparison && c.comparison.rows.length">
      <div class="label">
        {{ t('compose.measured') }}
      </div>
      <Comparison :data="c.comparison" />
      <p
        v-if="comparing && !c.comparison.rows.some(r => r.flagged)"
        class="meta-line"
      >
        {{ t('compose.equal') }}
      </p>
    </template>
    <label
      class="label"
      for="sg-compose-note"
    >{{ def?.note === 'required' ? t('compose.note') : t('compose.noteOptional') }}</label>
    <textarea
      id="sg-compose-note"
      v-model="note"
      class="field"
      :maxlength="LIMITS.note"
      :placeholder="t('composer.placeholder')"
      :data-autofocus="!def?.choice ? '' : undefined"
    />
    <details class="fold">
      <summary class="section">
        <Icon name="chevronRight" />{{ t('compose.details') }}
      </summary>
      <div
        class="seg"
        role="group"
        :aria-label="t('drawer.scope')"
      >
        <button
          v-for="s in scopes"
          :key="s.value"
          type="button"
          :aria-pressed="scope === s.value"
          @click="scope = s.value"
        >
          {{ t(s.label) }}
        </button>
      </div>
      <div class="checks">
        <label
          v-for="k in CONSTRAINTS"
          :key="k"
          class="check"
        >
          <input
            v-model="keep"
            type="checkbox"
            :value="k"
          >
          {{ t(`drawer.${camel(k)}`) }}
        </label>
      </div>
    </details>
    <p
      v-if="existing"
      class="notice"
      role="status"
    >
      {{ t('compose.exists', { number: existing.seq }) }}
      <button
        type="button"
        class="link"
        @click="openExisting"
      >
        {{ t('compose.open', { number: existing.seq }) }}
      </button>
    </p>
    <footer class="form-foot">
      <span class="hint">{{ t('compose.hint') }}</span>
      <button
        type="button"
        class="key wide raised"
        @click="engine.cancelCompose()"
      >
        {{ t('compose.cancel') }}
      </button>
      <button
        type="button"
        class="key wide primary"
        :disabled="!ready"
        @click="add"
      >
        {{ t('compose.add') }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { CONSTRAINTS, type ConstraintId, type Scope } from '../../core/model'
import { LIMITS } from '../../core/validate'
import type { Composing } from '../../dom/engine'
import { choiceLabel, describe, presetLabel } from '../labels'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import Comparison from './Comparison.vue'
import Icon from './Icon.vue'

const props = defineProps<{ c: Composing }>()
const { engine, state, ui, t } = useRuntime()
const el = ref<HTMLElement | null>(null)
const note = ref('')
const scope = ref<Scope>('occurrence')
const keep = ref<ConstraintId[]>([])

const camel = (s: string) => s.replace(/-([a-z])/g, (_m, ch: string) => ch.toUpperCase())
const def = computed(() => engine.registry.byId.get(props.c.preset))
const title = computed(() => presetLabel(def.value, props.c.preset, t))
const name = (chip: string, kind?: string) => kind === 'group' ? t('issue.group', { count: Number(chip) }) : kind === 'region' ? t('issue.region') : chip
const sentence = computed(() => describe({
  preset: props.c.preset,
  params: props.c.params,
  a: name(props.c.a.chip, props.c.a.kind),
  ...(props.c.b ? { b: props.c.b.chip } : {}),
  count: props.c.a.kind === 'group' ? Number(props.c.a.chip) : 1,
}, engine.registry, t))
const comparing = computed(() => !!def.value?.compare && (props.c.preset.startsWith('consistent-') || props.c.preset === 'off-scale'))
const existing = computed(() => state.value.drafts.issues.find(i => i.id === props.c.existing) ?? null)
const ready = computed(() => {
  const d = def.value
  if (!d || existing.value) return false
  if (d.choice && !d.choice.options.includes(props.c.params[d.choice.key] ?? '')) return false
  return d.note !== 'required' || note.value.trim().length > 0
})

const scopes: { value: Scope, label: string }[] = [
  { value: 'occurrence', label: 'drawer.scopeOccurrence' },
  { value: 'screen', label: 'drawer.scopeScreen' },
  { value: 'component', label: 'drawer.scopeComponent' },
]

async function add() {
  if (!ready.value) return
  await engine.commit({ note: note.value, scope: scope.value, constraints: keep.value })
}

function openExisting() {
  const id = props.c.existing
  engine.cancelCompose()
  if (id) openIssue(ui, id)
}

onMounted(async () => {
  await nextTick()
  el.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
})
</script>
