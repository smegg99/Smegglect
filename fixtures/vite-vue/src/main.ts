// fixtures/vite-vue/src/main.ts
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

// A manual mount next to the plugin's: the runtime must stay single.
// The DEV guard is what keeps a manual import out of release builds; a URL check alone would ship it.
if (import.meta.env.DEV && location.search.includes('manual')) {
  void import('smegglect').then(({ mount }) => {
    ;(window as unknown as { manual: unknown }).manual = mount({ project: { id: 'vite-vue' } })
  })
}
