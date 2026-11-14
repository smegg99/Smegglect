<!-- fixtures/nuxt/app/pages/index.vue -->
<template>
  <v-container class="py-6">
    <h1 class="text-h5 mb-4">
      Rooms
    </h1>
    <ItemCard
      v-for="room in rooms"
      :key="room.id"
      :name="room.name"
      :seats="room.seats"
    />
    <NuxtLink
      id="to-about"
      to="/about"
    >
      About
    </NuxtLink>
  </v-container>
</template>

<script setup lang="ts">
const rooms = [
  { id: 1, name: 'Lab 1', seats: 24 },
  { id: 2, name: 'Lab 2', seats: 18 },
  { id: 3, name: 'Hall', seats: 120 },
]
</script>
