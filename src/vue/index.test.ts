// src/vue/index.test.ts
import { describe, expect, it } from 'vitest'
import { relativeFile, vueSource } from './index'

function el(chain: { name: string, file?: string }[]): Element {
  let parent: object | null = null
  for (const c of [...chain].reverse()) parent = { type: { __name: c.name, ...(c.file ? { __file: c.file } : {}) }, parent }
  return { __vueParentComponent: parent, parentElement: null } as unknown as Element
}

describe('vue source', () => {
  const provider = vueSource({ root: '/work/app' })

  it('reports the nearest project component, not the library one', () => {
    const src = provider.source(el([{ name: 'VBtn' }, { name: 'ItemCard', file: '/work/app/app/components/ItemCard.vue' }, { name: 'Page', file: '/work/app/app/pages/index.vue' }]))
    expect(src).toEqual({ quality: 'component', provenance: 'vue-instance', component: 'ItemCard', file: 'app/components/ItemCard.vue', owners: ['VBtn (external)', 'ItemCard', 'Page'] })
  })

  it('never reports node_modules or files outside the root', () => {
    expect(relativeFile('/work/app/node_modules/x/A.vue', '/work/app')).toBeUndefined()
    expect(relativeFile('/elsewhere/B.vue', '/work/app')).toBeUndefined()
    expect(relativeFile('/abs/C.vue', undefined)).toBeUndefined()
    const src = provider.source(el([{ name: 'Lib', file: '/work/app/node_modules/lib/Lib.vue' }]))
    expect(src).toBeNull()
  })

  it('returns null without Vue instance data', () => {
    expect(provider.source({ parentElement: null } as unknown as Element)).toBeNull()
  })
})
