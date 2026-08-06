import { beforeEach, describe, expect, it } from 'bun:test'
import { createOAuth, installStorage, mockOAuthFunctions, registerOAuthCleanup } from './test-utils'
import type { OAuth } from './types'

const local = installStorage()
registerOAuthCleanup()

/** A real local server, so the assertions are about what was sent rather than about a mock's arguments. */
let server: ReturnType<typeof Bun.serve>
let seen: Array<{ url: string; authorization: string | null }>
let respond: () => Response

const origin = () => `http://localhost:${server.port}`

describe('authorized transport', () => {
  let oauth: OAuth
  let refresh: ReturnType<typeof mockOAuthFunctions>['refresh']

  beforeEach(() => {
    local.clear()
    seen = []
    respond = () => Response.json({ ok: true })
    server ??= Bun.serve({
      port: 0,
      fetch: request => {
        seen.push({ url: new URL(request.url).pathname, authorization: request.headers.get('authorization') })
        return respond()
      }
    })
    const functions = mockOAuthFunctions()
    refresh = functions.refresh
    oauth = createOAuth({ ignorePaths: [/public/], functions })
  })

  describe('authHeaders', () => {
    it('returns the bearer', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      expect(await oauth.authHeaders('/api/orders')).toEqual({ Authorization: 'Bearer at' })
    })

    it('refreshes an expired token before answering', async () => {
      refresh.mockResolvedValue({ access_token: 'fresh', token_type: 'Bearer', expires_in: 60 })
      oauth.setConfig({ tokenPath: '/t', clientId: 'c' })
      oauth.setToken({ access_token: 'stale', token_type: 'Bearer', refresh_token: 'r', expires: Date.now() - 10_000 })

      expect(await oauth.authHeaders('/api/orders')).toEqual({ Authorization: 'Bearer fresh' })
      expect(refresh).toHaveBeenCalled()
    })

    it('is empty for an ignored path', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      expect(await oauth.authHeaders('/api/public/products')).toEqual({})
    })

    it('is empty without a token', async () => {
      expect(await oauth.authHeaders('/api/orders')).toEqual({})
    })
  })

  describe('oauth.fetch', () => {
    it('sends the bearer', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      await oauth.fetch(`${origin()}/api/orders`)

      expect(seen).toEqual([{ url: '/api/orders', authorization: 'Bearer at' }])
    })

    it('does not send it to an ignored path', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      await oauth.fetch(`${origin()}/api/public/products`)

      expect(seen[0]?.authorization).toBeNull()
    })

    it('keeps the caller headers', async () => {
      oauth.setToken({ access_token: 'at', token_type: 'Bearer' })

      const response = await oauth.fetch(`${origin()}/api/orders`, {
        method: 'POST',
        headers: { 'X-Custom': 'kept' },
        body: '{}'
      })

      expect(response.ok).toBe(true)
      expect(seen[0]?.authorization).toBe('Bearer at')
    })

    it('records a 401 body on the token and still lets the caller read it', async () => {
      oauth.setToken({ access_token: 'at' })
      respond = () => Response.json({ error: 'invalid_token' }, { status: 401 })

      const response = await oauth.fetch(`${origin()}/api/orders`)

      // the body is cloned, so storing it must not consume it
      expect(await response.json()).toEqual({ error: 'invalid_token' })
      expect(oauth.token()).toEqual({ error: 'invalid_token' })
      expect(oauth.hasError()).toBe(true)
    })

    it('leaves the token alone on other statuses', async () => {
      const initial = { access_token: 'at' }
      oauth.setToken(initial)
      respond = () => new Response('boom', { status: 500 })

      const response = await oauth.fetch(`${origin()}/api/orders`)

      expect(response.status).toBe(500)
      expect(oauth.token()).toEqual(initial)
    })

    it('does not reject on a non-2xx — fetch semantics, not axios', async () => {
      respond = () => new Response('nope', { status: 403 })

      expect((await oauth.fetch(`${origin()}/api/orders`)).status).toBe(403)
    })
  })
})
