import { beforeEach, describe, expect, it } from 'bun:test'
import { createStorageStore } from './storage'
import { installStorage } from './test-utils'

const local = installStorage()

beforeEach(() => {
  local.clear()
})

describe('createStorageStore', () => {
  it('falls back to the initial value when nothing is stored', () => {
    expect(createStorageStore('k', { a: 1 }).get()).toEqual({ a: 1 })
  })

  it('seeds from storage when a value is present', () => {
    local.setItem('k', JSON.stringify({ a: 2 }))
    expect(createStorageStore('k', { a: 1 }).get()).toEqual({ a: 2 })
  })

  it('persists synchronously on set', () => {
    const s = createStorageStore<{ a: number }>('k', { a: 1 })
    s.set({ a: 9 })
    expect(JSON.parse(local.getItem('k')!)).toEqual({ a: 9 })
  })

  it('applies the map function to the seeded value', () => {
    local.setItem('n', JSON.stringify('5'))
    expect(createStorageStore<number>('n', 0, v => Number(v)).get()).toBe(5)
  })

  it('rekey loads the new key without writing to it', () => {
    local.setItem('site-a', JSON.stringify({ token: 'a' }))
    local.setItem('site-b', JSON.stringify({ token: 'b' }))
    const s = createStorageStore<{ token?: string }>('site-a', {})

    s.rekey('site-b')

    expect(s.get()).toEqual({ token: 'b' })
    // the read must not stamp site-a's value onto site-b
    expect(JSON.parse(local.getItem('site-b')!)).toEqual({ token: 'b' })
  })

  it('rekey to an empty key yields the initial value and leaves the old key intact', () => {
    local.setItem('site-a', JSON.stringify({ token: 'a' }))
    const s = createStorageStore<{ token?: string }>('site-a', {})

    s.rekey('site-new')

    expect(s.get()).toEqual({})
    expect(JSON.parse(local.getItem('site-a')!)).toEqual({ token: 'a' })
  })

  it('writes go to the new key after rekey', () => {
    const s = createStorageStore<{ token?: string }>('site-a', {})
    s.rekey('site-b')
    s.set({ token: 'fresh' })

    expect(JSON.parse(local.getItem('site-b')!)).toEqual({ token: 'fresh' })
    expect(local.getItem('site-a')).toBeNull()
  })

  it('rekey to the same key is a no-op', () => {
    const s = createStorageStore<{ token?: string }>('k', {})
    s.set({ token: 'keep' })
    s.rekey('k')
    expect(s.get()).toEqual({ token: 'keep' })
  })

  it('notifies subscribers on rekey — React has to learn the token changed', () => {
    local.setItem('site-b', JSON.stringify({ token: 'b' }))
    const s = createStorageStore<{ token?: string }>('site-a', {})
    const seen: Array<string | undefined> = []
    s.store.subscribe(state => seen.push(state.value.token))

    s.rekey('site-b')

    expect(seen).toEqual(['b'])
  })

  it('persists a set that re-enters during rekey', () => {
    local.setItem('site-b', JSON.stringify({ token: 'b' }))
    const s = createStorageStore<{ token?: string }>('site-a', {})

    // token.ts does exactly this: a watcher on the token store reacts to rekey by writing back a
    // derived field (setExpires). That write lands while rekey's cascade is still running.
    let reentered = false
    s.store.subscribe(state => {
      if (!reentered && state.value.token === 'b') {
        reentered = true
        s.set({ token: 'b', derived: 'computed-on-rekey' } as { token?: string })
      }
    })

    s.rekey('site-b')

    // suppressing persistence with a mutable flag for the duration of rekey dropped this write
    expect(JSON.parse(local.getItem('site-b')!)).toEqual({ token: 'b', derived: 'computed-on-rekey' })
    expect(local.getItem('site-a')).toBeNull()
  })
})
