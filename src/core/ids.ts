// src/core/ids.ts

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Random id safe for file names and storage keys, e.g. `iss_k3x9...`. */
export function createId(prefix: string): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `${prefix}_${out}`
}
