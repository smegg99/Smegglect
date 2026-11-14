// src/wails/index.ts
// Optional desktop adapter. It never imports the Wails runtime: the app passes its own generated bindings.

import type { SaveBundle } from '../overlay/settings'

/** Bytes as base64 without a data-URL prefix, the shape Go's encoding/base64 reads. */
export async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Native save through a binding such as `ExportService.Save(name, base64) -> path`.
 * An empty path means the user cancelled; a rejected call means it failed. Both report "not saved".
 */
export function bindingSave(save: (name: string, data: string) => Promise<string>): SaveBundle {
  return async ({ name, blob }) => {
    const path = await save(name, await base64(blob))
    return typeof path === 'string' && path.length > 0
  }
}
