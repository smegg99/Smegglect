// src/overlay/styles/index.ts
// Inlined as strings and attached to the shadow root; nothing reaches the host document.

import guides from './guides.css?inline'
import inspector from './inspector.css?inline'
import keys from './keys.css?inline'
import surfaces from './surfaces.css?inline'
import tokens from './tokens.css?inline'

export const STYLES: readonly string[] = [tokens, keys, surfaces, inspector, guides]
