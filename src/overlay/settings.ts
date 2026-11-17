// src/overlay/settings.ts
// Public settings types; no Vue import, so published declarations do not need Vue.

export type Placement = 'bottom' | 'top' | 'left' | 'right'

/** `auto` follows the browser; the rest are the shipped catalogues. */
export type Language = 'auto' | 'en' | 'pl'

export interface PresetUse {
  preset: string
  params: Record<string, string>
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  /** CSS colour for the selection accent; empty keeps the theme's. */
  accent: string
  placement: Placement
  /** Where the button sits along its edge: 0 at the left or top end, 1 at the other. */
  offset: number
  /** Always show text labels under dock keys. */
  labels: boolean
  /** 36px keys and 18px glyphs. */
  large: boolean
  /** The overlay's language as chosen: the browser's, or one of the shipped ones. */
  language: Language
  /** The language in use, read from `language` unless a `locale` mount option fixes it. */
  locale: string
  /** Alt+Shift shortcuts; Escape works either way. */
  shortcuts: boolean
  /** This page never answers an agent's checks (an observer page). */
  watchOnly: boolean
  /** Words about the agent in the Issues tab: whether one listens, and each sent report's state. */
  agentStatus: boolean
  /** The toolbar and panel move, scale and open with transitions; off, they change at once. */
  motion: boolean
  /**
   * On the left and right edges too, the toolbar keeps its captions and so the size it has on the others,
   * while one column holds them.
   */
  steadySize: boolean
  /** Plates slide out of the pointer's way, like magnets of the same polarity; off, they stay put. */
  dodge: boolean
  favourites: PresetUse[]
}

/**
 * Saves a bundle somewhere other than a browser download, e.g. a native dialog.
 * False means it did not save.
 */
export type SaveBundle = (bundle: { name: string, blob: Blob }) => Promise<boolean>
