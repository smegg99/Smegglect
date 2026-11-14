// src/core/version.ts
// The package version, set by the builds; `dev` when running from source (tests, the playground).

declare const __SMEGGLECT_VERSION__: string | undefined

export const VERSION: string = typeof __SMEGGLECT_VERSION__ === 'string' ? __SMEGGLECT_VERSION__ : 'dev'
