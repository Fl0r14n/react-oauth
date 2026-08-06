import { beforeEach, describe, expect, it } from 'bun:test'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import { OAuthType } from './types'

const local = installStorage()
registerOAuthCleanup()

beforeEach(() => {
  local.clear()
})

describe('createOAuth', () => {
  it('holds no module-level state — instances are reachable only through the value returned', () => {
    const first = createOAuth({ storageKey: 'a', functions: mockOAuthFunctions() })
    const second = createOAuth({ storageKey: 'b', functions: mockOAuthFunctions() })

    // creating the second must not disturb the first in any way. Under a last-one-wins module pointer
    // this is where one request started answering with another request's instance.
    first.setToken({ access_token: 'first', type: OAuthType.RESOURCE })
    second.dispose()

    expect(first.token().access_token).toBe('first')
    expect(first.isAuthorized()).toBe(true)
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

  it('dispose is idempotent', () => {
    const oauth = createOAuth({ storageKey: 'twice', functions: mockOAuthFunctions() })

    oauth.dispose()
    oauth.dispose()

    // the watchers are gone, but the stores still answer — nothing threw on the second teardown
    oauth.setToken({ access_token: 'after-double-dispose' })
    expect(oauth.token().access_token).toBe('after-double-dispose')
  })
})
