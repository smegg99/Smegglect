// src/dom/window.ts
// The window the DOM code works in: the page's own, with its constructors, which may not be this realm's.

export type HostWindow = Window & typeof globalThis

/** The window a document is shown in. A document without one (detached, or parsed) cannot be measured. */
export function windowOf(doc: Document): HostWindow {
  const win = doc.defaultView
  if (!win) throw new Error('smegglect: the document has no window')
  return win
}
