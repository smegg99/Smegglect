// src/overlay/context.ts

import type { InjectionKey } from 'vue'
import type { Engine } from '../dom/engine'
import type { Translate } from './i18n'
import type { OverlayVuetify } from './vuetify'
import type { SaveBundle, Settings } from './settings'

export type { Placement, PresetUse, SaveBundle, Settings } from './settings'

export const ENGINE: InjectionKey<Engine> = Symbol('engine')
export const SETTINGS: InjectionKey<Settings> = Symbol('settings')
export const TRANSLATE: InjectionKey<Translate> = Symbol('t')
export const DOC: InjectionKey<Document> = Symbol('doc')
export const SAVE: InjectionKey<SaveBundle | null> = Symbol('save')
/** Settings a mount option fixes; the Settings tab shows them as set by the app. */
export const FIXED: InjectionKey<ReadonlySet<keyof Settings>> = Symbol('fixed')
/** The overlay's Vuetify: its theme follows the overlay's settings. */
export const KIT: InjectionKey<OverlayVuetify> = Symbol('kit')
/** The mount's instance name, which names its pop-out window. */
export const INSTANCE: InjectionKey<string> = Symbol('instance')
