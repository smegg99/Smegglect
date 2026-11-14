<!-- fixtures/nuxt/app/components/ItemCard.vue -->
<template>
  <v-card
    class="mb-3"
    variant="outlined"
  >
    <v-card-title>{{ name }}</v-card-title>
    <v-card-text>{{ seats }} seats</v-card-text>
    <v-card-actions>
      <v-btn
        class="book"
        color="primary"
      >
        Book
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{ name: string, seats: number }>()
</script>
