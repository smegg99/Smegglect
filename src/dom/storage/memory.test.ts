// src/dom/storage/memory.test.ts
import { describe, expect, it } from 'vitest'
import type { HistoryEvent } from '../../core/model'
import { memoryStorage } from './memory'

function event(id: string, project: string, minute: number): HistoryEvent {
  return { id, project, at: `2026-11-14T00:${String(minute).padStart(2, '0')}:00Z`, kind: 'added' }
}

describe('memory history', () => {
  it('keeps only the newest lines of a project when one is added, and leaves other projects alone', async () => {
    const storage = memoryStorage()
    await storage.addEvent(event('evt_other', 'other', 0), 2)
    for (const minute of [1, 2, 3, 4]) await storage.addEvent(event(`evt_${minute}`, 'demo', minute), 2)
    const demo = await storage.listEvents('demo', 10)
    expect(demo.ok && demo.value.map(line => line.id)).toEqual(['evt_4', 'evt_3'])
    const other = await storage.listEvents('other', 10)
    expect(other.ok && other.value.map(line => line.id)).toEqual(['evt_other'])
  })
})
