import { beforeEach, describe, expect, it, jest } from 'bun:test'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import type { OAuth } from './types'

const local = installStorage()
registerOAuthCleanup()

const request = (url: string) =>
  ({
    url,
    headers: { setAuthorization: jest.fn() }
  }) as any

describe('http interceptors', () => {
  let oauth: OAuth
  let refresh: ReturnType<typeof mockOAuthFunctions>['refresh']

  beforeEach(() => {
    local.clear()
    const functions = mockOAuthFunctions()
    refresh = functions.refresh
    oauth = createOAuth({
      ignorePaths: [/public/],
      functions
    })
  })

  describe('authorizationInterceptor', () => {
    it('attaches the access token', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      const req = request('/api/orders')
      await oauth.authorizationInterceptor(req)

      expect(req.headers.setAuthorization).toHaveBeenCalledWith('Bearer at')
    })

    it('refreshes an expired token before attaching it', async () => {
      refresh.mockResolvedValue({ access_token: 'fresh', token_type: 'Bearer', expires_in: 60 })
      oauth.setConfig({ tokenPath: '/t', clientId: 'c' })
      oauth.setToken({ access_token: 'stale', token_type: 'Bearer', refresh_token: 'r', expires: Date.now() - 10_000 })

      const req = request('/api/orders')
      await oauth.authorizationInterceptor(req)

      expect(refresh).toHaveBeenCalled()
      expect(req.headers.setAuthorization).toHaveBeenCalledWith('Bearer fresh')
    })

    it('skips ignored paths', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      const req = request('/api/public/products')
      await oauth.authorizationInterceptor(req)

      expect(req.headers.setAuthorization).not.toHaveBeenCalled()
    })

    it('leaves the request untouched without a token', async () => {
      const req = request('/api/orders')
      await oauth.authorizationInterceptor(req)

      expect(req.headers.setAuthorization).not.toHaveBeenCalled()
    })
  })

  describe('unauthorizedInterceptor', () => {
    it('persists the 401 response body as token', async () => {
      oauth.setToken({ access_token: 'at' })
      const error = { response: { status: 401, data: { error: 'invalid_token' } } }

      await expect(oauth.unauthorizedInterceptor(error)).rejects.toBe(error)
      expect(oauth.token()).toEqual({ error: 'invalid_token' })
    })

    it('ignores other errors', async () => {
      const initial = { access_token: 'at' }
      oauth.setToken(initial)
      const error = { response: { status: 500, data: 'boom' } }

      await expect(oauth.unauthorizedInterceptor(error)).rejects.toBe(error)
      expect(oauth.token()).toEqual(initial)
    })
  })

  it('gives each instance its own axios instance, so SSR requests cannot share interceptors', () => {
    const other = createOAuth({ storageKey: 'other', functions: mockOAuthFunctions() })
    expect(oauth.http).not.toBe(other.http)
  })
})
