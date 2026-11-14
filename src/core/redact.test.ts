// src/core/redact.test.ts
import { describe, expect, it } from 'vitest'
import { cleanClasses, cleanLocation, cleanText, maskSecrets, scrub, stableId } from './redact'

describe('redaction', () => {
  it('strips query, hash and userinfo from locations', () => {
    expect(cleanLocation('https://user:pw@app.test/orders/7?token=abc#x')).toBe('https://app.test/orders/7')
    expect(cleanLocation('https://app.test/reset/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijk')).toBe('https://app.test/reset/[redacted]')
  })

  it('masks tokens in free text', () => {
    expect(maskSecrets('Authorization: Bearer abc.def.ghi123456')).toContain('Bearer [redacted]')
    expect(maskSecrets('api_key=sk-test-1234567890abcdefgh')).not.toContain('1234567890')
    expect(maskSecrets('see https://x.test/a?session=123 now')).toBe('see https://x.test/a now')
    expect(maskSecrets('password: hunter2')).toBe('password: [redacted]')
    expect(maskSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe('[redacted]')
    expect(maskSecrets('Save order')).toBe('Save order')
  })

  it('bounds and flattens labels', () => {
    expect(cleanText('  a\n\tb  ', 10)).toBe('a b')
    expect(cleanText('x'.repeat(50), 10)).toBe('xxxxxxx...')
  })

  it('drops generated ids and classes', () => {
    expect(stableId('save-button')).toBe('save-button')
    expect(stableId(':r1:')).toBeUndefined()
    expect(stableId('v-12345')).toBeUndefined()
    expect(stableId('3f2a9c1e-0000-4000-8000-123456789abc')).toBeUndefined()
    expect(cleanClasses(['btn', 'css-1x2y3z', 'primary', 'data-v-7ba5bd90'])).toEqual(['btn', 'primary'])
  })

  it('scrubs every string in a structure', () => {
    expect(scrub({ a: ['token=abcdef123456'], n: 3 })).toEqual({ a: ['token=[redacted]'], n: 3 })
  })
})
