<!-- playground/fixtures/VueFixture.vue -->
<template>
  <main class="fixture">
    <h1>Inventory</h1>
    <div class="toolbar">
      <button id="shuffle" type="button" @click="shuffle">Shuffle</button>
      <button id="drop-first" type="button" @click="items.shift()">Remove first</button>
      <button id="rerender" type="button" @click="items = items.map(i => ({ ...i }))">Re-render</button>
      <button id="open-menu" type="button" @click="menu = !menu">Menu</button>
      <button id="open-sheet" type="button" @click="sheet = true">Sheet</button>
    </div>
    <ul class="list">
      <ItemRow
        v-for="item in items"
        :key="item.id"
        :name="item.name"
        :qty="item.qty"
        @remove="remove(item.id)"
      />
    </ul>
    <p id="removed">Removed: {{ removed }}</p>
    <Teleport to="body">
      <div v-if="menu" id="menu" class="menu" role="menu">
        <button type="button" role="menuitem">Rename</button>
        <button type="button" role="menuitem">Duplicate</button>
        <button type="button" role="menuitem">Archive</button>
      </div>
      <div v-if="sheet" class="sheet" role="dialog" aria-label="Sheet">
        <p>CSS dialog with a fixed backdrop.</p>
        <button id="close-sheet" type="button" @click="sheet = false">Close</button>
      </div>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ItemRow from './ItemRow.vue'

const items = ref([
  { id: 1, name: 'Lamp', qty: 2 },
  { id: 2, name: 'Desk', qty: 1 },
  { id: 3, name: 'Chair', qty: 4 },
  { id: 4, name: 'Shelf', qty: 1 },
])
const removed = ref(0)
const menu = ref(false)
const sheet = ref(false)

function remove(id: number) {
  removed.value++
  items.value = items.value.filter(i => i.id !== id)
}

function shuffle() {
  items.value = [...items.value].reverse()
}
</script>

<style>
.fixture .toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.fixture button { padding: 6px 12px; border: 1px solid #b9b3c2; border-radius: 6px; background: #fff; font: inherit; }
.fixture .list { list-style: none; margin: 0; padding: 0; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
.menu { position: fixed; top: 120px; left: 50%; display: flex; flex-direction: column; padding: 6px; border: 1px solid #ccc; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 0.15); z-index: 1000; }
.menu button { padding: 6px 12px; border: 0; background: none; text-align: left; }
.sheet { position: fixed; inset: 0; display: grid; place-content: center; background: rgb(0 0 0 / 0.4); z-index: 2000; }
.sheet p { padding: 24px; margin: 0; background: #fff; border-radius: 8px; }
</style>
