// src/wails/index.ts
// Optional desktop adapter. It never imports the Wails runtime: the app passes its own generated bindings.

import type { BridgeTransport } from '../dom/bridge'
import type { SaveBundle } from '../overlay/settings'
import { base64 } from '../dom/base64'

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

/** A generated binding call: a promise the app can cancel, as Wails v3 returns. */
type Cancellable<T> = Promise<T> & { cancel?: () => void }

/**
 * Bridge requests through a binding such as `SmegglectService.Bridge(request) -> { status, body }`,
 * for a window whose origin the broker does not admit.
 * Aborting cancels the call, which ends the Go side's request.
 */
export function bindingBridge(
  call: (request: Parameters<BridgeTransport>[0]) => Cancellable<{ status: number, body: string }>,
): BridgeTransport {
  return (request, signal) => {
    if (signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'))
    const pending = call(request)
    const cancel = () => pending.cancel?.()
    signal?.addEventListener('abort', cancel, { once: true })
    return pending.finally(() => signal?.removeEventListener('abort', cancel))
  }
}
