// src/overlay/logos.ts
// The Smegglect logo, read from its asset file rather than copied: an edited asset is the logo the next build
// shows.

import smegglect from '../../assets/smegglect.svg?raw'

export interface LogoPath {
  d: string
  /** White parts take the text colour, so the art reads on both themes. */
  fill: string
  /** The transforms of the groups around the path, then its own. */
  transform: string
  evenodd: boolean
}

export interface LogoArt {
  viewBox: string
  paths: readonly LogoPath[]
}

const WHITE = /^#f{3}(?:f{3})?$/i

function fillOf(path: Element): string {
  const fill = path.getAttribute('fill') ?? '#000'
  return WHITE.test(fill) ? 'currentColor' : fill
}

/** Every path of a drawing in document order. */
function artOf(svg: string): LogoArt {
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const paths: LogoPath[] = []
  const walk = (element: Element, around: readonly string[]) => {
    const own = element.getAttribute('transform')
    const chain = own ? [...around, own] : around
    if (element.localName === 'path') paths.push({
      d: element.getAttribute('d') ?? '',
      fill: fillOf(element),
      transform: chain.join(' '),
      evenodd: element.getAttribute('fill-rule') === 'evenodd',
    })
    for (const child of element.children) walk(child, chain)
  }
  walk(root, [])
  return { viewBox: root.getAttribute('viewBox') ?? '0 0 24 24', paths }
}

let parsed: LogoArt | null = null

/** Read once per page, when first shown. */
export function smegglectLogo(): LogoArt {
  parsed ??= artOf(smegglect)
  return parsed
}
