// src/dom/index.ts
// Headless browser engine. Importing it touches no global; createEngine and createHost do.

export { createEngine } from './engine'
export type {
  ApplyResult, Engine, EngineOptions, EngineState, Geometry, Notice, SelectedInfo,
} from './engine'
export { createHost, HOST_TAG } from './host'
export type { OwnedHost } from './host'
export { createScope } from './scope'
export type { Scope } from './scope'
export { describe, chipOf, DEFAULT_TEST_ATTRIBUTES } from './describe'
export { resolve } from './resolve'
export type { Resolution } from './resolve'
export type { ContextProvider, SourceProvider } from './providers'
export type { Pin, PinStatus } from './pins'
export { hostScheme } from './capture'
export { boxModel, composedContains, readout } from './boxmodel'
export type { BoxModel, Readout, Sides } from './boxmodel'
export { indexedDbStorage, memoryStorage } from './storage'
export type { DraftRecord, DraftStorage, Res, StoreError } from './storage'
export type { Bundle, SessionState, StorageStatus, SubmitResult } from './session'
export { bridgeClient } from './bridge'
export type { BridgeClient, BridgeConfig, BridgeResult } from './bridge'
