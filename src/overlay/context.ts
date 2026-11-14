// src/overlay/context.ts

import type { InjectionKey } from 'vue'
import type { Engine } from '../dom/engine'
import type { Translate } from './i18n'
import type { SaveBundle, Settings } from './settings'

export type { Placement, PresetUse, SaveBundle, Settings } from './settings'

export const ENGINE: InjectionKey<Engine> = Symbol('engine')
export const SETTINGS: InjectionKey<Settings> = Symbol('settings')
export const T: InjectionKey<Translate> = Symbol('t')
export const DOC: InjectionKey<Document> = Symbol('doc')
export const SAVE: InjectionKey<SaveBundle | null> = Symbol('save')
