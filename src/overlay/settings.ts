// src/overlay/settings.ts
// Public settings types; no Vue import, so published declarations do not need Vue.

export type Placement = 'bottom' | 'top' | 'left' | 'right'

export interface PresetUse {
  preset: string
  params: Record<string, string>
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  /** CSS colour for the selection accent; empty keeps the theme's. */
  accent: string
  placement: Placement
  /** Side of the screen the inspector opens on. */
  side: 'left' | 'right'
  /** Always show text labels under dock keys. */
  labels: boolean
  /** 36px keys and 18px glyphs. */
  large: boolean
  locale: string
  favourites: PresetUse[]
}

/** Saves a bundle somewhere other than a browser download, e.g. a native dialog. False means it did not save. */
export type SaveBundle = (bundle: { name: string, blob: Blob }) => Promise<boolean>
