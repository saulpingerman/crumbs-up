import { describe, expect, it } from 'vitest'
import type { ProcessedPhoto } from '@/lib/db/schema'
import { pendingCutout, trackCutout } from './pending'

const photo = () => ({ mime: 'image/jpeg' }) as ProcessedPhoto

describe('cut-outs in flight', () => {
  it('can be picked up by whoever holds the same photo', async () => {
    const source = photo()
    const result = photo()
    let finish!: (value: ProcessedPhoto | null) => void
    void trackCutout(source, new Promise((resolve) => (finish = resolve)))

    const waiting = pendingCutout(source)
    expect(waiting).toBeDefined()
    expect(pendingCutout(photo())).toBeUndefined()

    finish(result)
    await expect(waiting).resolves.toBe(result)
    // Once it has landed there is nothing left to wait for.
    await Promise.resolve()
    expect(pendingCutout(source)).toBeUndefined()
  })

  it('hands a failure to whoever started it, and nothing to anyone waiting', async () => {
    const source = photo()
    const started = trackCutout(source, Promise.reject(new Error('offline')))
    await expect(pendingCutout(source)).resolves.toBeNull()
    await expect(started).rejects.toThrow('offline')
  })
})
