<!-- fixtures/vite-vue/src/App.vue -->
<template>
  <main class="page">
    <h1>Tasks</h1>
    <ul class="tasks">
      <TaskRow
        v-for="task in tasks"
        :key="task.id"
        :title="task.title"
        @done="tasks = tasks.filter(t => t.id !== task.id)"
      />
    </ul>
    <button id="menu-toggle" type="button" @click="menu = !menu">Menu</button>
    <Teleport to="body">
      <nav v-if="menu" id="menu" class="menu">
        <button type="button">Archive</button>
      </nav>
    </Teleport>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TaskRow from './components/TaskRow.vue'

const tasks = ref([
  { id: 1, title: 'Write the brief' },
  { id: 2, title: 'Review the overlay' },
  { id: 3, title: 'Ship the fixture' },
])
const menu = ref(false)
</script>

<style>
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; background: #fff; }
.page { max-width: 640px; margin: 32px auto; }
.tasks { padding: 0; list-style: none; }
.menu { position: fixed; top: 80px; right: 40px; padding: 8px; border: 1px solid #ccc; background: #fff; }
</style>
