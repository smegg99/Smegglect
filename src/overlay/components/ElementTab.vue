<!-- src/overlay/components/ElementTab.vue -->
<template>
  <div
    ref="body"
    class="body element"
    role="tabpanel"
  >
    <EmptyState
      v-if="!info"
      icon="pick"
      :title="t('inspector.nothingSelected')"
      :text="t('inspector.empty')"
    >
      <button
        type="button"
        class="tile"
        @click="engine.togglePick()"
      >
        <Icon name="pick" /><span class="label">{{ t('dock.pick') }}</span><kbd>Alt+Shift+P</kbd>
      </button>
      <button
        type="button"
        class="tile"
        @click="engine.toggleRegion()"
      >
        <Icon name="region" /><span class="label">{{ t('dock.region') }}</span><kbd>Alt+Shift+R</kbd>
      </button>
    </EmptyState>
    <template v-else>
      <section class="target">
        <div class="target-row">
          <div class="chip">
            <span
              class="name"
              :title="chip"
            >{{ chip }}</span>
            <span class="dims">{{ dims }}</span>
          </div>
          <Key
            v-if="info.canEscalate"
            icon="parent"
            :label="t('strip.parent')"
            tip-side="below"
            @click="engine.escalate()"
          />
          <Key
            v-if="info.kind !== 'region'"
            icon="group"
            :label="t('strip.group')"
            shape="mode"
            :pressed="state.extend"
            tip-side="below"
            @click="toggleGroup"
          />
          <Key
            icon="close"
            :label="t('inspector.clear')"
            tip-side="below"
            @click="engine.clear()"
          />
        </div>
        <Tree
          v-if="info.kind === 'group'"
          name="members"
          :label="t('inspector.members')"
          :nodes="memberNodes"
          @hover="node => (ui.member = node ? memberIndex(node) : null)"
          @remove="dropMember"
        />
        <p
          v-if="info.boundary"
          class="notice"
          role="status"
        >
          <span class="warn">{{ boundaryText }}</span>
          <button
            type="button"
            class="link"
            @click="engine.toggleRegion()"
          >
            {{ t('inspector.drawInstead') }}
          </button>
        </p>
      </section>
      <section
        v-if="here.length"
        class="here"
      >
        <h3 class="section">
          {{ t('inspector.here') }}
        </h3>
        <button
          v-for="i in here"
          :key="i.id"
          type="button"
          class="here-line"
          @click="openIssue(ui, i.id)"
        >
          <span class="num">{{ i.seq }}</span>{{ issueTitle(i, engine.registry, t) }}
        </button>
      </section>
      <IssueForm
        v-if="state.composing"
        :key="state.composing.preset"
        :c="state.composing"
      />
      <!-- Hidden, not unmounted, while the form is open, so opened folds stay open. -->
      <Actions
        v-show="!state.composing"
        :kind="info.kind"
      />
      <Readout />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { px } from '../../core/geometry'
import { issueTitle } from '../labels'
import { openIssue } from '../navigate'
import { useRuntime } from '../runtime'
import Actions from './Actions.vue'
import EmptyState from './EmptyState.vue'
import IssueForm from './IssueForm.vue'
import Key from './Key.vue'
import Tree, { type TreeNode } from './Tree.vue'
import Readout from './Readout.vue'
import Icon from './Icon.vue'

const { engine, state, geo, ui, t } = useRuntime()
const body = ref<HTMLElement | null>(null)

const info = computed(() => state.value.selected)

const chip = computed(() => {
  const i = info.value
  if (!i) return ''
  if (i.kind === 'region') return t('strip.region')
  if (i.kind === 'group') return t('strip.elements', { count: i.descriptors.length })
  return i.chips[0] ?? ''
})

const dims = computed(() => {
  const a = geo.value.a
  return a ? `${px(a.width)} x ${px(a.height)}` : ''
})

const boundaryText = computed(() => {
  const b = info.value?.boundary
  return b === 'canvas' ? t('strip.canvas') : b === 'iframe' ? t('strip.iframe') : t('strip.closedRoot')
})

/** Issues already reported on this selection, so the same thing is not reported twice. */
const here = computed(() => {
  void state.value.drafts
  return engine.issuesOnSelection()
})

/** A group's members as tree rows, each with its rendered size and an X; hovering one marks it on the page. */
const memberNodes = computed<TreeNode[]>(() => {
  const i = info.value
  if (i?.kind !== 'group') return []
  const remove = t('inspector.removeMember')
  return [{
    id: 'members',
    label: t('inspector.members'),
    children: i.chips.map((chip, n) => {
      const r = geo.value.members[n]
      return { id: `member:${n}`, label: chip, icon: 'pick', quiet: true, remove, ...(r ? { meta: `${px(r.width)} x ${px(r.height)}` } : {}) }
    }),
  }]
})

const memberIndex = (node: TreeNode) => Number(node.id.slice('member:'.length))

/** Takes a member out of the group; when one is left the list goes, so focus moves to the actions. */
async function dropMember(node: TreeNode) {
  const last = info.value?.kind === 'group' && info.value.chips.length <= 2
  ui.member = null
  engine.drop(memberIndex(node))
  if (!last) return
  await nextTick()
  body.value?.querySelector<HTMLElement>('[data-tree="actions"] [tabindex="0"]')?.focus()
}

/** Building a group means picking, so switching it on also turns picking on. */
function toggleGroup() {
  const on = !state.value.extend
  engine.setExtend(on)
  if (on && state.value.inspect.mode.kind !== 'pick') engine.togglePick()
}

// After the form closes, keyboard focus returns to the tile that opened it.
watch(() => state.value.composing?.preset ?? null, async (now, before) => {
  if (now || !before) return
  await nextTick()
  const root = body.value?.getRootNode() as ShadowRoot | undefined
  if (root?.activeElement?.closest('.inspector')) return
  body.value?.querySelector<HTMLElement>(`[data-tree="actions"] [data-preset="${before}"]`)?.focus()
})

</script>
