import { beforeEach, describe, expect, it, jest } from 'bun:test'
import type { OAuth } from '../core/types'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from '../test-utils'
import { createAxiosClient, createAxiosInterceptors } from './index'

const local = installStorage()
registerOAuthCleanup()

const request = (url: string) => ({ url, headers: { set: jest.fn() } }) as any

describe('axios adapter', () => {
  let oauth: OAuth
  let refresh: ReturnType<typeof mockOAuthFunctions>['refresh']

  beforeEach(() => {
    local.clear()
    const functions = mockOAuthFunctions()
    refresh = functions.refresh
    oauth = createOAuth({ ignorePaths: [/public/], functions })
  })

  describe('authorizationInterceptor', () => {
    it('sets the bearer header', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })
      const { authorizationInterceptor } = createAxiosInterceptors(oauth)

      const req = request('/api/orders')
      await authorizationInterceptor(req)

      expect(req.headers.set).toHaveBeenCalledWith('Authorization', 'Bearer at')
    })

    it('refreshes an expired token first', async () => {
      refresh.mockResolvedValue({ access_token: 'fresh', token_type: 'Bearer', expires_in: 60 })
      oauth.setConfig({ tokenPath: '/t', clientId: 'c' })
      oauth.setToken({ access_token: 'stale', token_type: 'Bearer', refresh_token: 'r', expires: Date.now() - 10_000 })
      const { authorizationInterceptor } = createAxiosInterceptors(oauth)

      const req = request('/api/orders')
      await authorizationInterceptor(req)

      expect(refresh).toHaveBeenCalled()
      expect(req.headers.set).toHaveBeenCalledWith('Authorization', 'Bearer fresh')
    })

    it('skips ignored paths', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })
      const { authorizationInterceptor } = createAxiosInterceptors(oauth)

      const req = request('/api/public/products')
      await authorizationInterceptor(req)

      expect(req.headers.set).not.toHaveBeenCalled()
    })

    it('leaves the request alone without a token', async () => {
      const { authorizationInterceptor } = createAxiosInterceptors(oauth)

      const req = request('/api/orders')
      await authorizationInterceptor(req)

      expect(req.headers.set).not.toHaveBeenCalled()
    })
  })

  describe('unauthorizedInterceptor', () => {
    it('records the 401 body and re-rejects', async () => {
      oauth.setToken({ access_token: 'at' })
      const { unauthorizedInterceptor } = createAxiosInterceptors(oauth)
      const error = { response: { status: 401, data: { error: 'invalid_token' } } }

      // bookkeeping, not error handling — the caller still sees the failure
      await expect(unauthorizedInterceptor(error)).rejects.toBe(error)
      expect(oauth.token()).toEqual({ error: 'invalid_token' })
    })

    it('clears the session when the 401 body is not an object', async () => {
      oauth.setToken({ access_token: 'at' })
      const { unauthorizedInterceptor } = createAxiosInterceptors(oauth)
      // axios hands the body over as a string when the gateway answers with HTML or nothing at all, and a
      // string stored as the token would make every getter read a character index
      const error = { response: { status: 401, data: '<html>401</html>' } }

      await expect(unauthorizedInterceptor(error)).rejects.toBe(error)
      expect(oauth.token()).toEqual({})
    })

    it('ignores other statuses', async () => {
      const initial = { access_token: 'at' }
      oauth.setToken(initial)
      const { unauthorizedInterceptor } = createAxiosInterceptors(oauth)
      const error = { response: { status: 500, data: 'boom' } }

      await expect(unauthorizedInterceptor(error)).rejects.toBe(error)
      expect(oauth.token()).toEqual(initial)
    })

    it('survives an error with no response at all', async () => {
      const { unauthorizedInterceptor } = createAxiosInterceptors(oauth)
      const error = new Error('network down')

      await expect(unauthorizedInterceptor(error)).rejects.toBe(error)
    })
  })

  describe('createAxiosClient', () => {
    it('gives each instance its own client, so concurrent SSR renders cannot share interceptors', () => {
      const other = createOAuth({ storageKey: 'other', functions: mockOAuthFunctions() })

      expect(createAxiosClient(oauth)).not.toBe(createAxiosClient(other))
    })

    it('attaches both interceptors', () => {
      const client = createAxiosClient(oauth)

      expect((client.interceptors.request as any).handlers.length).toBe(1)
      expect((client.interceptors.response as any).handlers.length).toBe(1)
    })

    it('takes axios defaults', () => {
      const client = createAxiosClient(oauth, { baseURL: 'https://api.example.com' })

      expect(client.defaults.baseURL).toBe('https://api.example.com')
    })
  })
})
