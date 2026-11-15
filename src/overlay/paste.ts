// src/overlay/paste.ts
// Images pasted from the clipboard (Ctrl+V), which become attachments like a chosen file.

/** The image files a paste carries; none when it holds only text, which then pastes as usual. */
export function pastedImages(event: ClipboardEvent): File[] {
  const items = [...(event.clipboardData?.items ?? [])]
  return items
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
}

/** A pasted screenshot has no name of its own. */
export const pastedName = (file: File) => file.name || 'pasted image'
