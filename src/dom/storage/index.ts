// src/dom/storage/index.ts
// Draft, submission, follow-up and file storage. IndexedDB by default, memory when it is unavailable.

export { forkWindow, lastWindow, prefs, rememberWindow, tabWindow, type Prefs } from './browser'
export { indexedDbStorage } from './indexeddb'
export { memoryStorage } from './memory'
export { draftKey, type DraftRecord, type DraftStorage, type Res, type StoreError } from './types'
