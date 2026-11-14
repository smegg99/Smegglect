<!-- fixtures/wails/frontend/src/App.vue -->
<template>
  <div class="desk">
    <header class="title" style="--wails-draggable: drag">
      <span class="name">Smegglect Desk</span>
      <span class="grow" />
      <button id="close" class="square" type="button" aria-label="Close window" style="--wails-draggable: no-drag" @click="Window.Close()">
        <svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z" /></svg>
      </button>
    </header>
    <div class="strip">
      <button id="ping" class="key" type="button" @click="ping">Ping backend</button>
      <span id="pings" class="meta">Backend pings: {{ pings }}</span>
      <span class="sep" />
      <button v-for="m in modes" :key="m" class="key" :class="{ on: mode === m }" type="button" @click="mode = m">{{ m }}</button>
      <span class="sep" />
      <button id="prev" class="square" type="button" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" /></svg></button>
      <button id="next" class="square" type="button" aria-label="Next"><svg viewBox="0 0 24 24"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z" /></svg></button>
      <span class="grow" />
      <div class="menu-wrap">
        <button id="menu" class="key" type="button" aria-haspopup="menu" :aria-expanded="menu" @click="menu = !menu">View</button>
        <div v-if="menu" class="menu" role="menu">
          <button type="button" role="menuitem" @click="menu = false">Compact</button>
          <button type="button" role="menuitem" @click="menu = false">Comfortable</button>
        </div>
      </div>
      <button id="open-dialog" class="key" type="button" @click="dialog?.showModal()">Settings</button>
    </div>
    <main class="body">
      <section class="panel rooms">
        <header class="head">Rooms</header>
        <ul>
          <li v-for="room in rooms" :key="room.id" class="room">
            <span class="room-name">{{ room.name }}</span>
            <span class="seats">{{ room.seats }}</span>
            <button class="book key" type="button" @click="ping">Book</button>
          </li>
        </ul>
      </section>
      <section class="panel log">
        <header class="head">Log</header>
        <div id="log" class="scroll">
          <p v-for="n in 40" :key="n" class="line">{{ String(n).padStart(2, '0') }}:00 Lesson moved to room {{ (n % 4) + 1 }}</p>
          <button id="deep" class="key" type="button">End of log</button>
        </div>
      </section>
    </main>
    <dialog ref="dialog" class="dialog">
      <p>Settings</p>
      <button id="dialog-ok" class="key" type="button" @click="ping">Apply</button>
      <button id="dialog-close" class="key" type="button" @click="dialog?.close()">Close</button>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { Window } from '@wailsio/runtime'
import { onMounted, ref } from 'vue'
import { Ping, Pings } from '../bindings/smegglect/fixtures/wails/services/deskservice'

const pings = ref(0)
const modes = ['Tones', 'Octaves', 'Chords']
const mode = ref('Tones')
const menu = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
const rooms = [
  { id: 1, name: 'Lab 1', seats: 24 },
  { id: 2, name: 'Lab 2', seats: 18 },
  { id: 3, name: 'Hall', seats: 120 },
  { id: 4, name: 'Library', seats: 40 },
]

async function ping() {
  pings.value = await Ping()
}

onMounted(async () => {
  pings.value = await Pings()
})
</script>

<style>
:root { color-scheme: dark; }
body { margin: 0; background: #141218; color: #efe9f2; font: 13px/1.35 system-ui, sans-serif; overflow: hidden; }
.desk { display: flex; flex-direction: column; height: 100vh; }
.title { display: flex; align-items: center; height: 34px; padding: 0 6px 0 12px; background: #1f1d23; border-bottom: 1px solid #585262; }
.name { font-weight: 600; }
.grow { flex: 1; }
.strip { display: flex; align-items: center; gap: 6px; margin: 8px; padding: 4px 8px; border: 1px solid #585262; border-radius: 6px; background: #1f1d23; }
.key { height: 26px; padding: 0 10px; border: 1px solid #585262; border-radius: 4px; background: #36343a; color: #efe9f2; font: inherit; font-size: 12px; }
.key.on { background: #e85d51; border-color: transparent; color: #141218; }
.square { display: inline-grid; place-items: center; width: 26px; height: 26px; min-width: 26px; padding: 0; border: 1px solid #585262; border-radius: 4px; background: #36343a; color: #efe9f2; }
.square svg { width: 16px; height: 16px; fill: currentColor; }
.sep { width: 1px; height: 18px; background: #45404f; }
.meta { color: #a49fa7; font-size: 12px; }
.menu-wrap { position: relative; }
.menu { position: absolute; top: 30px; right: 0; display: flex; flex-direction: column; padding: 4px; border: 1px solid #585262; border-radius: 8px; background: #27252b; z-index: 5; }
.menu button { height: 28px; padding: 0 12px; border: 0; background: none; color: inherit; text-align: left; }
.body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-height: 0; flex: 1; margin: 0 8px 8px; }
.panel { display: flex; flex-direction: column; min-height: 0; border: 1px solid #585262; border-radius: 6px; background: #1f1d23; }
.head { padding: 8px 10px; border-bottom: 1px solid #585262; color: #d3cdd5; font-size: 12px; font-weight: 600; }
.rooms ul { margin: 0; padding: 0; list-style: none; }
.room { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-bottom: 1px solid #45404f; }
.room-name { flex: 1; }
.seats { color: #a49fa7; font-variant-numeric: tabular-nums; }
.scroll { overflow: auto; padding: 4px 10px; }
.line { margin: 4px 0; color: #d3cdd5; }
.dialog { border: 1px solid #585262; border-radius: 8px; background: #27252b; color: #efe9f2; }
</style>
