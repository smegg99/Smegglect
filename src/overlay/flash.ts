// src/overlay/flash.ts
// A change to the issue list lights the Issues tab and key once, where a toast used to take the space.

/** Two names for one animation: switching between them restarts it, so every change flashes again. */
export function flashClass(count: number): string | undefined {
  if (!count) return undefined
  return count % 2 ? 'flash-odd' : 'flash-even'
}
