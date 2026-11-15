// src/overlay/vuetify/shadow-css.test.ts
import { describe, expect, it } from 'vitest'
import { forShadow, layerOrder } from './shadow-css'

describe('forShadow', () => {
  it('moves document-root rules onto the shadow host', () => {
    expect(forShadow(':root{--a:1}')).toBe(':host{--a:1}')
    expect(forShadow(':root[data-motion=off] .x{a:b}')).toBe(':host([data-motion=off]) .x{a:b}')
    expect(forShadow(':root:not([data-motion]){a:b}')).toBe(':host(:not([data-motion])){a:b}')
    expect(forShadow(':root[data-a][data-b=c]{a:b}')).toBe(':host([data-a][data-b=c]){a:b}')
  })

  it("takes Vuetify's layer order from the statements its stylesheet opens with", () => {
    const css = '/*! v */\n@layer a{@layer r, b}@layer c;@layer d{@layer x;@layer y}@layer d.x{.k{l:m}}.z{}'
    expect(layerOrder(css)).toBe('@layer a{@layer r, b}@layer c;@layer d{@layer x;@layer y}')
  })

  it('reads the order from an unminified sheet too, as Vuetify ships per component', () => {
    const css = '@layer a {\n  @layer r, b;\n}\n@layer c;\n@layer d.x {\n  .k { l: m; }\n}\n'
    expect(layerOrder(css)).toBe('@layer a {\n  @layer r, b;\n}\n@layer c;\n')
  })

  it('pins rem to px so the host page cannot scale the overlay', () => {
    expect(forShadow('.a{font-size:1rem;margin:.5rem -0.25rem;letter-spacing:.0125rem}'))
      .toBe('.a{font-size:16px;margin:8px -4px;letter-spacing:0.2px}')
    expect(forShadow('.text-remove{x:2rem}')).toBe('.text-remove{x:32px}')
  })
})
