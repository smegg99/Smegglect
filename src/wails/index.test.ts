// src/wails/index.test.ts
import { describe, expect, it } from 'vitest'
import { bindingBridge } from './index'

describe('bindingBridge', () => {
  it('forwards the request and cancels the binding call when the signal aborts', async () => {
    let cancelled = 0
    const transport = bindingBridge((request) => {
      let fail: (e: Error) => void = () => {}
      const pending = new Promise<{ status: number, body: string }>((done, f) => {
        fail = f
        if (request.path === '/v1/health') done({ status: 200, body: '{}' })
      }) as Promise<{ status: number, body: string }> & { cancel: () => void }
      pending.cancel = () => {
        cancelled++
        fail(new Error('cancelled'))
      }
      return pending
    })
    expect(await transport({ method: 'GET', path: '/v1/health' })).toEqual({ status: 200, body: '{}' })
    const stop = new AbortController()
    const polling = transport({ method: 'GET', path: '/v1/page/next?after=1&wait=25' }, stop.signal)
    stop.abort()
    await expect(polling).rejects.toThrow('cancelled')
    expect(cancelled).toBe(1)
    stop.abort()
    expect(cancelled).toBe(1)
  })

  it('does not call at all with a signal that already aborted', async () => {
    let calls = 0
    const transport = bindingBridge(() => {
      calls++
      return Promise.resolve({ status: 200, body: '' })
    })
    const stop = new AbortController()
    stop.abort()
    await expect(transport({ method: 'GET', path: '/v1/health' }, stop.signal)).rejects.toThrow('aborted')
    expect(calls).toBe(0)
  })
})
