// src/dom/host.ts
// The only node Smegglect adds to the host document, with an open shadow root for style containment.

export const HOST_TAG = 'smegglect-root'

/** Inline !important beats host stylesheets, including `* { ... !important }` resets. */
const HOST_STYLE = [
  'all: initial',
  'display: block',
  'position: fixed',
  'inset: 0 auto auto 0',
  'width: 0',
  'height: 0',
  'margin: 0',
  'padding: 0',
  'border: 0',
  'overflow: visible',
  'background: transparent',
  'transform: none',
  'filter: none',
  'contain: none',
  'pointer-events: none',
  'z-index: 2147483647',
].map(rule => `${rule} !important`).join('; ')

export interface OwnedHost {
  element: HTMLElement
  shadow: ShadowRoot
  mountPoint: HTMLElement
  /** True for the host element and anything inside its shadow tree. */
  owns: (node: EventTarget | null) => boolean
  /** True when the event passed through Smegglect's own tree. */
  inPath: (event: Event) => boolean
  /** Moves the host to the top of the top layer, above host dialogs and popovers opened since. */
  raise: () => void
  topLayer: boolean
  destroy: () => void
}

export interface HostOptions {
  instance: string
  styles: readonly string[]
}

function supportsPopover(el: HTMLElement): boolean {
  return typeof el.showPopover === 'function' && typeof el.hidePopover === 'function'
}

function adopt(doc: Document, shadow: ShadowRoot, css: readonly string[]) {
  const Sheet = doc.defaultView?.CSSStyleSheet
  if (Sheet && 'adoptedStyleSheets' in shadow && 'replaceSync' in Sheet.prototype) {
    shadow.adoptedStyleSheets = css.map((text) => {
      const sheet = new Sheet()
      sheet.replaceSync(text)
      return sheet
    })
    return
  }
  for (const text of css) {
    const style = doc.createElement('style')
    style.textContent = text
    shadow.append(style)
  }
}

export function createHost(doc: Document, options: HostOptions): OwnedHost {
  const element = doc.createElement(HOST_TAG)
  element.setAttribute('data-instance', options.instance)
  element.setAttribute('style', HOST_STYLE)
  const shadow = element.attachShadow({ mode: 'open' })
  adopt(doc, shadow, options.styles)
  const mountPoint = doc.createElement('div')
  mountPoint.className = 'sg-mount'
  shadow.append(mountPoint)

  const topLayer = supportsPopover(element)
  if (topLayer) element.setAttribute('popover', 'manual')
  doc.documentElement.append(element)

  function raise() {
    if (!topLayer || !element.isConnected) return
    try {
      if (element.matches(':popover-open')) element.hidePopover()
      element.showPopover()
    }
    catch {
      // A host that removed popover support or an unexpected state keeps the fixed-position fallback.
    }
  }
  raise()

  const owns = (node: EventTarget | null): boolean => {
    if (!node || !(node instanceof doc.defaultView!.Node)) return false
    return node === element || node.getRootNode() === shadow
  }

  return {
    element,
    shadow,
    mountPoint,
    owns,
    inPath: event => event.composedPath().includes(element),
    raise,
    topLayer,
    destroy() {
      if (topLayer && element.matches(':popover-open')) element.hidePopover()
      element.remove()
    },
  }
}
