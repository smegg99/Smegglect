// playground/fixtures/vue-main.ts
import { mount } from 'smegglect'
import * as dom from 'smegglect/dom'
import { createApp } from 'vue'
import VueFixture from './VueFixture.vue'

createApp(VueFixture).mount('#app')
;(window as unknown as { smegglectDom: typeof dom }).smegglectDom = dom

const params = new URLSearchParams(location.search)
;(window as unknown as { sg: unknown }).sg = mount({ project: { id: 'vue-fixture' }, open: params.has('open') })
