import { beforeEach, describe, expect, it } from 'bun:test'
import { createOAuth, flush, idToken, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import type { OAuth } from './types'

const local = installStorage()
registerOAuthCleanup()

describe('user', () => {
  let oauth: OAuth
  let userInfo: ReturnType<typeof mockOAuthFunctions>['userInfo']

  beforeEach(() => {
    local.clear()
    const functions = mockOAuthFunctions()
    userInfo = functions.userInfo
    oauth = createOAuth({ functions })
  })

  it('derives the user from the id_token claims', async () => {
    oauth.setToken({ id_token: idToken({ name: 'Jane', email: 'jane@acme.io' }) })

    await flush()

    expect(oauth.user()).toMatchObject({ name: 'Jane', email: 'jane@acme.io' })
  })

  it('fetches userinfo once authorized and a userPath is configured', async () => {
    userInfo.mockResolvedValue({ name: 'From Endpoint' })
    oauth.setConfig({ userPath: '/userinfo' } as any)
    oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

    await flush()

    expect(userInfo).toHaveBeenCalledWith(oauth.config(), oauth.http)
    expect(oauth.user()).toEqual({ name: 'From Endpoint' })
  })

  it('fetches userinfo on creation with a stored token and a static userPath', async () => {
    const functions = mockOAuthFunctions()
    functions.userInfo.mockResolvedValue({ name: 'Restored' })
    // token already in storage + userPath configured up front: neither watch source ever changes
    local.setItem('token', JSON.stringify({ access_token: 'at', token_type: 'Bearer', expires: Date.now() + 60_000 }))
    const restored = createOAuth({ functions, config: { userPath: '/userinfo' } as any })

    await flush()

    expect(functions.userInfo).toHaveBeenCalled()
    expect(restored.user()).toEqual({ name: 'Restored' })
  })

  it('does not fetch userinfo without a userPath', async () => {
    oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

    await flush()

    expect(userInfo).not.toHaveBeenCalled()
  })

  it('keeps user state isolated between instances', async () => {
    oauth.setToken({ id_token: idToken({ name: 'Jane' }) })
    // own storageKey: instances sharing a key legitimately share the persisted token
    const second = createOAuth({ storageKey: 'second.token', functions: mockOAuthFunctions() })

    await flush()

    expect(oauth.user()).toMatchObject({ name: 'Jane' })
    expect(second.user()).toBeUndefined()
  })

  it('stops updating once disposed', async () => {
    oauth.dispose()

    oauth.setToken({ id_token: idToken({ name: 'Too Late' }) })
    await flush()

    expect(oauth.user()).toBeUndefined()
  })
})
