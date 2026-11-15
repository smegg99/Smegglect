// src/overlay/popout.test.ts
import { describe, expect, it } from 'vitest'
import { canPopOut } from './popout'

const win = (protocol: string) => ({ location: { protocol } }) as unknown as Window

describe('canPopOut', () => {
  it('offers a pop-out window on a web page', () => {
    expect(canPopOut(win('http:'))).toBe(true)
    expect(canPopOut(win('https:'))).toBe(true)
  })

  it('offers none in a desktop app window, which has no popup windows to give', () => {
    expect(canPopOut(win('wails:'))).toBe(false)
    expect(canPopOut(win('file:'))).toBe(false)
  })
})
