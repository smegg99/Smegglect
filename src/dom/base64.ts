// src/dom/base64.ts

/** Bytes per String.fromCharCode call: spreading a whole image at once overflows the call stack. */
const CHUNK = 0x8000

/** Bytes as base64 without a data-URL prefix, the shape Go's encoding/base64 reads. */
export async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}
