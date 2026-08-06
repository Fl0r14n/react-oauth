import { beforeEach, describe, expect, it } from 'bun:test'
import { getActiveOAuth } from './module'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import { OAuthType } from './types'

const local = installStorage()
registerOAuthCleanup()

beforeEach(() => {
  local.clear()
})

describe('getActiveOAuth', () => {
  it('resolves the last created instance', () => {
    const oauth = createOAuth({ storageKey: 'a', functions: mockOAuthFunctions() })

    expect(getActiveOAuth()).toBe(oauth)
  })

  it('throws once every instance is disposed', () => {
    createOAuth({ storageKey: 'a', functions: mockOAuthFunctions() }).dispose()

    expect(() => getActiveOAuth()).toThrow(/no active OAuth instance/)
  })

  it('keeps pointing at the surviving instance when another one is disposed', () => {
    const first = createOAuth({ storageKey: 'a', functions: mockOAuthFunctions() })
    const second = createOAuth({ storageKey: 'b', functions: mockOAuthFunctions() })

    second.dispose()

    // the pointer moved to `second` on creation and is cleared by its dispose; `first` is still
    // alive but is no longer the *active* one — resolving globally must not silently answer with it
    expect(() => getActiveOAuth()).toThrow(/no active OAuth instance/)
    expect(first.token()).toEqual({})
  })
})

describe('instance isolation', () => {
  it('gives concurrent requests separate tokens and axios instances', () => {
    const first = createOAuth({ storageKey: 'site-a.token', functions: mockOAuthFunctions() })
    const second = createOAuth({ storageKey: 'site-b.token', functions: mockOAuthFunctions() })

    first.setToken({ access_token: 'first', type: OAuthType.RESOURCE })
    second.setToken({ access_token: 'second', type: OAuthType.CLIENT_CREDENTIAL })

    expect(first.token().access_token).toBe('first')
    expect(second.token().access_token).toBe('second')
    // separate axios instances: interceptors close over one request's token, never the other's
    expect(first.http).not.toBe(second.http)
  })

  it('exposes a writable token — a punch-out session assigns one directly', () => {
    const oauth = createOAuth({ storageKey: 'punchout', functions: mockOAuthFunctions() })

    oauth.setToken({ access_token: 'injected', token_type: 'Bearer', type: OAuthType.RESOURCE, expires_in: 3600 })

    expect(oauth.accessToken()).toBe('Bearer injected')
    expect(oauth.type()).toBe(OAuthType.RESOURCE)
  })

  it('dispose stops the watchers but leaves the store usable', () => {
    const oauth = createOAuth({ storageKey: 'disposed', functions: mockOAuthFunctions() })

    oauth.dispose()
    oauth.setToken({ access_token: 'still-settable' })

    expect(oauth.token().access_token).toBe('still-settable')
  })

  it('dispose is idempotent, so a double teardown cannot corrupt the alive count', () => {
    const oauth = createOAuth({ storageKey: 'twice', functions: mockOAuthFunctions() })

    oauth.dispose()
    oauth.dispose()

    const next = createOAuth({ storageKey: 'next', functions: mockOAuthFunctions() })
    expect(getActiveOAuth()).toBe(next)
  })
})
