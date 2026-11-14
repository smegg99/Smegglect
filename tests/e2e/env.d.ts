// tests/e2e/env.d.ts
import type * as dom from '../../src/dom/index'
import type * as smegglect from '../../src/overlay/index'

declare global {
  interface Window {
    events: string[]
    sg: ReturnType<typeof smegglect.mount> | undefined
    smegglect: typeof smegglect
    smegglectDom: typeof dom
  }
}
